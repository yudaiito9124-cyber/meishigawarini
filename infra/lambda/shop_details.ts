/**
 * @file shop_details.ts
 * @role ショップ用：店舗プロフィール・設定管理ハンドラー
 * @responsibility
 *  - 店舗名、説明文（HTML）、および店舗紹介用の画像アセットを管理します。
 *  - 【マルチレコード・アーキテクチャ】
 *    - METADATA: 基本情報（名前、連絡先、通知設定）
 *    - DETAIL_HTML: 肥大化しやすい HTML コンテンツと画像リスト
 *    - SETTINGS#SHIPPING_LABEL: 配送ラベルの印字設定
 *    - これらを分離することで、基本情報の読み取りパフォーマンスを維持し、DynamoDB の 400KB 制限を回避します。
 *  - 【アセット・ライフサイクル管理】
 *    - 更新時（`update`）: 新旧の画像 URL リストを比較し、不要になった画像を S3 から物理削除。
 *    - 取得時（`get`）: 保存された S3 パスに対し動的に署名を付与。
 * @context
 *  - ショップ管理画面の「設定」タブにおける全ての操作を司るバックエンドの正本です。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, UpdateCommand, BatchGetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { checkShopOwnerOrGM } from './share/shop-auth';
import { signUrlsInHtml, signUrlIfS3, stripSignaturesInHtml, stripSignature, deleteFileByUrl } from './utils/s3';
import { getSystemDesign } from './utils/designs';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getShopId, getAction, getUserId } from './utils/request';
import { ShopApiSchema } from '@shared/api-types';
import { refreshMailingLists } from './utils/mailing-list';
import { normalizeZipCode } from './utils/normalization';


export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const userId = getUserId(event);
        const shopId = getShopId(event, body);
        let action = getAction(event, body);

        // 互換性: 旧パスベースのルーティングに対応
        const resPath = event.resource;
        if (resPath.endsWith('/get')) action = 'get';
        else if (resPath.endsWith('/update')) action = 'update';

        if (!shopId) return errorResponse(400, 'Missing shopId');
        if (!userId) return errorResponse(401, 'Unauthorized');

        // 権限検証: 同時に最新のショップメタデータを取得
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (!shopMetadata) return errorResponse(403, 'Forbidden');

        // --------------------------------------------------------------------
        // ACTION: get (ショップ詳細の取得と情報の整形)
        // 目的: 管理画面表示用に、署名付き URL の生成とデザイン情報の結合を行います。
        // --------------------------------------------------------------------
        if (action === 'get') {
            // 【多レコード取得】DETAIL_HTML と SHIPPING_LABEL_SETTINGS を追加取得
            const extraKeys = [
                { PK: `SHOP#${shopId}`, SK: 'DETAIL_HTML' },
                { PK: `SHOP#${shopId}`, SK: 'SETTINGS#SHIPPING_LABEL' }
            ];
            // 【DB操作: BatchGetCommand】
            // [意図] ショップの基本メタデータに加え、別レコードとして分離されている
            // HTML コンテンツと配送ラベル設定を一度のラウンドトリップで取得します。
            // [Keys]
            // - DETAIL_HTML: 肥大化対策のため分離された HTML
            // - SETTINGS#SHIPPING_LABEL: 配送ラベルのカスタマイズ設定
            const extraRes = await ddb.send(new BatchGetCommand({
                RequestItems: { [TABLE_NAME]: { Keys: extraKeys } }
            }));
            const extras = extraRes.Responses?.[TABLE_NAME] || [];
            const detailRecord = extras.find(r => r.SK === 'DETAIL_HTML');
            const shippingRecord = extras.find(r => r.SK === 'SETTINGS#SHIPPING_LABEL');

            const result = { 
                ...shopMetadata,
                detail_html: detailRecord?.detail_html,
                html_image_urls: detailRecord?.html_image_urls,
                shipping_label_settings: shippingRecord?.shipping_label_settings
            };
            
            // RichText (HTML) 内の S3 パスを署名付き URL へ置換
            if (result.detail_html) {
                result.detail_html = await signUrlsInHtml(result.detail_html, BUCKET_NAME);
            }
            // 画像配列の署名化
            if (result.html_image_urls && Array.isArray(result.html_image_urls)) {
                result.html_image_urls = await Promise.all(
                    result.html_image_urls.map((url: string) => signUrlIfS3(url, BUCKET_NAME))
                );
            }

            // 【Enrichment】許可されているカードデザイン情報を BatchGet で一括取得
            const allowedDesignIds = (result as any).card_designs;
            if (allowedDesignIds && Array.isArray(allowedDesignIds) && allowedDesignIds.length > 0) {
                const keys = allowedDesignIds.map((id: string) => ({ PK: 'CARD_DESIGN#METADATA', SK: id }));
                const batchRes = await ddb.send(new BatchGetCommand({
                    RequestItems: { [TABLE_NAME]: { Keys: keys } }
                }));

                const rawDesigns = batchRes.Responses?.[TABLE_NAME] || [];
                const designList = await Promise.all(rawDesigns.map(async (d) => ({
                    design_id: d.SK as string, name: d.name as string, description: d.description as string,
                    width: d.width as number, height: d.height as number,
                    thumbf: d.thumbf ? await signUrlIfS3(d.thumbf, BUCKET_NAME) : undefined,
                    thumbb: d.thumbb ? await signUrlIfS3(d.thumbb, BUCKET_NAME) : undefined,
                    bgimgf: d.bgimgf ? await signUrlIfS3(d.bgimgf, BUCKET_NAME) : undefined
                })));
                
                // システム共通デザインの補完
                for (const id of allowedDesignIds) {
                    const sys = getSystemDesign(id);
                    if (sys && !designList.find(d => d.design_id === id)) {
                        designList.push({ design_id: id, name: id, description: "System Design", ...sys } as any);
                    }
                }
                (result as any).allowed_designs = designList;
            } else {
                (result as any).allowed_designs = [];
            }
            
            // レスポンスのクリーンアップ: 内部管理用の ID 配列は削除
            if ('card_designs' in result) delete (result as any).card_designs;
            
            return successResponse(result);
        }

        // --------------------------------------------------------------------
        // ACTION: update (ショップ情報の部分更新とアセット掃除)
        // 目的: プロフィール更新、および「使われなくなった画像」の自動削除。
        // --------------------------------------------------------------------
        if (action === 'update') {
            const {
                name,
                detail_html,
                html_image_urls,
                deleted_html_image_urls,
                shop_postal_code,
                shop_address,
                shop_phone,
                shop_recipient_name,
                shortest_delivery_days,
                delivery_time_options,
                order_notification_user_ids,
                inquiry_notification_user_ids,
                shipping_label_settings,
                delivery_notes
            } = body as ShopApiSchema['shop_details_update'];

            // バリデーション: 注意事項の文字数制限（1000文字以内）
            if (delivery_notes !== undefined && delivery_notes !== null && delivery_notes.length > 1000) {
                return errorResponse(400, 'INVALID_DELIVERY_NOTES_LENGTH');
            }

            // 【物理削除の整合性】現在の画像リストを正確に把握するため、DETAIL_HTML レコードを先行取得
            const currentDetailRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `SHOP#${shopId}`, SK: 'DETAIL_HTML' }
            }));
            const currentDetail = currentDetailRes.Item;

            const now = new Date().toISOString();
            const attrValues: any = { ':now': now };
            const attrNames: any = {};
            
            // 1. METADATA レコード用の基本フィールド更新式
            const metadataUpdateExprParts: string[] = ['ts_updated_at = :now'];
            
            if (name !== undefined) { 
                metadataUpdateExprParts.push('#name = :name'); 
                attrNames['#name'] = 'name'; 
                attrValues[':name'] = name; 
            }
            if (shop_postal_code !== undefined) { 
                metadataUpdateExprParts.push('shop_postal_code = :shop_postal_code'); 
                attrValues[':shop_postal_code'] = normalizeZipCode(shop_postal_code); 
            }
            if (shop_address !== undefined) { 
                metadataUpdateExprParts.push('shop_address = :shop_address'); 
                attrValues[':shop_address'] = shop_address; 
            }
            if (shop_phone !== undefined) { 
                metadataUpdateExprParts.push('shop_phone = :shop_phone'); 
                attrValues[':shop_phone'] = shop_phone; 
            }
            if (shop_recipient_name !== undefined) { 
                metadataUpdateExprParts.push('shop_recipient_name = :shop_recipient_name'); 
                attrValues[':shop_recipient_name'] = shop_recipient_name; 
            }
            if (shortest_delivery_days !== undefined) { 
                metadataUpdateExprParts.push('shortest_delivery_days = :sdd'); 
                attrValues[':sdd'] = shortest_delivery_days; 
            }
            if (delivery_time_options !== undefined) { 
                metadataUpdateExprParts.push('delivery_time_options = :dto'); 
                attrValues[':dto'] = delivery_time_options; 
            }
            if (order_notification_user_ids !== undefined) { 
                metadataUpdateExprParts.push('order_notification_user_ids = :ouid'); 
                attrValues[':ouid'] = order_notification_user_ids; 
            }
            if (inquiry_notification_user_ids !== undefined) { 
                metadataUpdateExprParts.push('inquiry_notification_user_ids = :iuid'); 
                attrValues[':iuid'] = inquiry_notification_user_ids; 
            }
            if (delivery_notes !== undefined) { 
                metadataUpdateExprParts.push('delivery_notes = :delivery_notes'); 
                attrValues[':delivery_notes'] = delivery_notes; 
            }

            // 画像 URL リストの同期と物理削除処理
            let newUrls: string[] | undefined = undefined;
            if (html_image_urls !== undefined) {
                newUrls = Array.isArray(html_image_urls) ? html_image_urls.map((url: string) => stripSignature(url)).filter((u): u is string => !!u) : [];
                // 専用レコードから古いURLを特定
                const oldUrls = (currentDetail?.html_image_urls as string[]) || [];

                // 【物理削除】以前のリストにはあったが、新しいリストからは消えた画像を S3 から抹消
                const toDelete = oldUrls.filter((url: string) => !newUrls!.includes(url));
                for (const url of toDelete) await deleteFileByUrl(url, BUCKET_NAME);

                // 歴史的互換性: クライアントが明示的に削除を要求した場合も対応
                if (deleted_html_image_urls && Array.isArray(deleted_html_image_urls)) {
                    for (const url of deleted_html_image_urls) {
                        const cleanUrl = stripSignature(url);
                        if (cleanUrl && !toDelete.includes(cleanUrl)) await deleteFileByUrl(cleanUrl, BUCKET_NAME);
                    }
                }
            }

            // 【DB操作: TransactWriteItems】
            const transactItems: any[] = [];

            // (A) METADATA レコードの更新とクリーンアップ
            // 常に legacy フィールドの削除を試みる
            const metadataRemoves = ['detail_html', 'html_image_urls', 'shipping_label_settings'];
            const metadataFinalExpr = `SET ${metadataUpdateExprParts.join(', ')} REMOVE ${metadataRemoves.join(', ')}`;

            transactItems.push({
                Update: {
                    TableName: TABLE_NAME,
                    Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' },
                    UpdateExpression: metadataFinalExpr,
                    ExpressionAttributeNames: Object.keys(attrNames).length > 0 ? attrNames : undefined,
                    ExpressionAttributeValues: attrValues
                }
            });

            // (B) DETAIL_HTML レコードの更新
            if (detail_html !== undefined || newUrls !== undefined) {
                const detailExpr: string[] = ['ts_updated_at = :now'];
                const detailValues: any = { ':now': now };
                if (detail_html !== undefined) {
                    detailExpr.push('detail_html = :html');
                    detailValues[':html'] = stripSignaturesInHtml(detail_html, BUCKET_NAME);
                }
                if (newUrls !== undefined) {
                    detailExpr.push('html_image_urls = :hiu');
                    detailValues[':hiu'] = newUrls;
                }
                transactItems.push({
                    Update: {
                        TableName: TABLE_NAME,
                        Key: { PK: `SHOP#${shopId}`, SK: 'DETAIL_HTML' },
                        UpdateExpression: `SET ${detailExpr.join(', ')}`,
                        ExpressionAttributeValues: detailValues
                    }
                });
            }

            // (C) SETTINGS#SHIPPING_LABEL レコードの更新
            if (shipping_label_settings !== undefined) {
                transactItems.push({
                    Update: {
                        TableName: TABLE_NAME,
                        Key: { PK: `SHOP#${shopId}`, SK: 'SETTINGS#SHIPPING_LABEL' },
                        UpdateExpression: 'SET shipping_label_settings = :sls, ts_updated_at = :now',
                        ExpressionAttributeValues: {
                            ':sls': shipping_label_settings,
                            ':now': now
                        }
                    }
                });
            }

            // 【DB操作: TransactWriteCommand】
            // [意図] 複数のレコード（METADATA, DETAIL_HTML, SETTINGS#SHIPPING_LABEL）を
            // アトミックに更新します。これにより、一部のデータだけが更新される不整合を防ぎます。
            // また、METADATA レコードから旧来の legacy フィールド（detail_html 等）を
            // REMOVE することで、データのクリーンアップと容量削減を同時に行います。
            await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }));

            // メールアドレスリストの再解決と保存の実行
            await refreshMailingLists(ddb, TABLE_NAME, shopId);

            return successResponse({ message: 'Shop updated' });
        }

        return errorResponse(400, 'Invalid action');
    } catch (error: any) {
        console.error('Shop details error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
