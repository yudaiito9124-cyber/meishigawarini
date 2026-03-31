/**
 * 概要: ユーザープロフィールの取得・更新 (Cognito認証)
 * 詳細: ユーザー自身の「送り主情報」(Sender Info)を管理します。
 * エンドポイント:
 *  - POST /user/profile/get (プロフィールの取得)
 *  - POST /user/profile/update (プロフィールの更新)
 *  - POST /user/profile/uploadurl (アップロード用URLの取得)
 * リクエストボディ:
 *  - [update の場合]
 *  - profile: 更新するプロフィール情報オブジェクト (必須)
 *  - deleted_html_image_urls: 削除対象のHTML画像URLリスト (オプション)
 *  - [uploadurl の場合]
 *  - filename: ファイル名 (必須)
 *  - contentType: コンテンツタイプ (必須)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { stripSignature, deleteFileByUrl, signUrlIfS3, signUrlsInHtml, stripSignaturesInHtml } from './utils/s3';
import { getSystemDesign } from './utils/designs';
import { appendToHistory } from './utils/history';

const client = new DynamoDBClient({});
const s3Client = new S3Client({});
const ddb = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true
    }
});
const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // CORS プリフライトリクエストへの対応
        if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

        // Cognito Authorizer からユーザーIDを取得
        const authorizer = event.requestContext?.authorizer;
        const userId = authorizer?.principalId;
        if (!userId) {
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };
        }

        const body = JSON.parse(event.body || '{}');
        const resPath = event.resource;

        // アクションの判別
        let action = '';
        if (resPath.includes('/history')) {
            if (resPath.endsWith('/get')) action = 'history_get';
            else if (resPath.endsWith('/sendgift')) action = 'history_sendgift';
        } else if (resPath.includes('/receiver')) {
            if (resPath.endsWith('/get')) action = 'receiver_get';
            else if (resPath.endsWith('/update')) action = 'receiver_update';
        } else {
            if (resPath.endsWith('/get')) action = 'get';
            else if (resPath.endsWith('/update')) action = 'update';
            else if (resPath.endsWith('/uploadurl')) action = 'uploadurl';
        }

        // ====================================================================
        // ACTION: get (プロフィールの取得)
        // ====================================================================
        if (action === 'get') {
            const pk = `USER#${userId}`;
            const sk = 'SENDER';

            // 【DB操作: GetItem】
            // - 目的: ログイン中のユーザーIDに紐づく「送り主」(SENDER) プロフィール情報を取得
            // - テーブル: TABLE_NAME (DynamoDB)
            // - キー構成:
            //   - PK: `USER#${userId}` (CognitoのサブID)
            //   - SK: 'SENDER' (送り主情報の固定SK)
            // - 取得項目: プロフィール全項目 (name, job_title, company, card_image_url, detail_html, など)
            const getRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: pk, SK: sk }
            }));

            if (!getRes.Item) {
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ profile: null, user_id: userId }) };
            }

            const profile = { ...getRes.Item };
            // PK, SK はレスポンスに含めない
            delete profile.PK;
            delete profile.SK;

            // S3画像に署名付きURLを付与（期限付きアクセスを許可）
            if (profile.card_image_url) {
                profile.card_image_url = await signUrlIfS3(profile.card_image_url, BUCKET_NAME);
            }
            if (profile.detail_html) {
                profile.detail_html = await signUrlsInHtml(profile.detail_html, BUCKET_NAME);
            }
            if (profile.html_image_urls && Array.isArray(profile.html_image_urls)) {
                profile.html_image_urls = await Promise.all(
                    profile.html_image_urls.map((url: string) => signUrlIfS3(url, BUCKET_NAME))
                );
            }

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ profile, user_id: userId }) };
        }

        // ====================================================================
        // ACTION: update (プロフィールの更新)
        // ====================================================================
        if (action === 'update') {
            const { profile, deleted_html_image_urls } = body;
            if (!profile) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing profile data' }) };
            }

            const pk = `USER#${userId}`;
            const sk = 'SENDER';

            // 更新対象のキーを除去（セキュリティと整合性のため）
            const restrictedKeys = ['ts_created_at', 'ts_updated_at', 'PK', 'SK', 'import_id'];
            const keys = Object.keys(profile).filter(k => !restrictedKeys.includes(k));

            if (keys.length === 0) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'No valid fields to update' }) };
            }

            // S3 URL から署名パラメータを除去して保存用にクリーンアップ
            const cleanProfile = {
                ...profile,
                card_image_url: stripSignature(profile.card_image_url),
                html_image_urls: (profile.html_image_urls || []).map((url: string) => stripSignature(url)),
                detail_html: stripSignaturesInHtml(profile.detail_html, BUCKET_NAME)
            };

            // 【DB操作: UpdateItem】
            // - 目的: ユーザーの「送り主」(SENDER) プロフィール情報を保存・部分更新
            // - テーブル: TABLE_NAME (DynamoDB)
            // - キー構成:
            //   - PK: `USER#${userId}` (ユーザーID)
            //   - SK: 'SENDER' (送り主情報の固定SK)
            // - 更新内容: 
            //   - ts_updated_at: 現在日時をセット
            //   - ts_created_at: 存在しない場合のみ現在日時をセット (if_not_exists)
            //   - #f{i}: profileオブジェクトに含まれる各フィールド (card_image_url, detail_html, html_image_urls 等)
            // - 更新戦略: 部分更新 (Upsert)。ReturnValues: 'ALL_OLD' を指定し、更新前の画像URLを取得してS3のクリーンアップに利用。
            const updateRes = await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: pk, SK: sk },
                UpdateExpression: 'SET #ts_up = :now, #ts_cr = if_not_exists(#ts_cr, :now), ' +
                    keys.map((_, i) => `#f${i} = :v${i}`).join(', '),
                ExpressionAttributeNames: {
                    '#ts_up': 'ts_updated_at',
                    '#ts_cr': 'ts_created_at',
                    ...keys.reduce((acc, k, i) => ({ ...acc, [`#f${i}`]: k }), {})
                },
                ExpressionAttributeValues: {
                    ':now': new Date().toISOString(),
                    ...keys.reduce((acc, k, i) => ({ ...acc, [`:v${i}`]: cleanProfile[k] }), {})
                },
                ReturnValues: 'ALL_OLD'
            }));

            // 不要になったS3画像の物理削除
            const oldImageUrl = updateRes.Attributes?.card_image_url;
            const newImageUrl = cleanProfile.card_image_url;
            if (oldImageUrl && oldImageUrl !== newImageUrl) {
                await deleteFileByUrl(oldImageUrl, BUCKET_NAME);
            }

            // HTMLアセット（画像）の削除
            const oldHtmlUrls = updateRes.Attributes?.html_image_urls || [];
            const newHtmlUrls = cleanProfile.html_image_urls || [];
            const toDelete = oldHtmlUrls.filter((url: string) => !newHtmlUrls.includes(url));
            for (const url of toDelete) {
                await deleteFileByUrl(url, BUCKET_NAME);
            }

            // 明示的に指定された削除リストの処理
            if (deleted_html_image_urls && Array.isArray(deleted_html_image_urls)) {
                for (const url of deleted_html_image_urls) {
                    const cleanUrl = stripSignature(url);
                    if (cleanUrl && !toDelete.includes(cleanUrl)) {
                        await deleteFileByUrl(cleanUrl, BUCKET_NAME);
                    }
                }
            }

            // 更新後のプロフィールを再取得して署名付きで返す (フロントエンドの整合性のため)
            const getRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: pk, SK: sk }
            }));

            let finalProfile = getRes.Item ? { ...getRes.Item } : profile;
            delete finalProfile.PK;
            delete finalProfile.SK;

            // S3画像に署名付きURLを付与
            if (finalProfile.card_image_url) {
                finalProfile.card_image_url = await signUrlIfS3(finalProfile.card_image_url, BUCKET_NAME);
            }
            if (finalProfile.detail_html) {
                finalProfile.detail_html = await signUrlsInHtml(finalProfile.detail_html, BUCKET_NAME);
            }
            if (finalProfile.html_image_urls && Array.isArray(finalProfile.html_image_urls)) {
                finalProfile.html_image_urls = await Promise.all(
                    finalProfile.html_image_urls.map((url: string) => signUrlIfS3(url, BUCKET_NAME))
                );
            }

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Profile updated successfully', profile: finalProfile }) };
        }

        // ====================================================================
        // ACTION: uploadurl (アップロード用URLの取得)
        // ====================================================================
        if (action === 'uploadurl') {
            const { filename, contentType } = body;
            if (!filename || !contentType) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing filename or contentType' }) };
            }

            // ファイルパスの設定 (ユーザーごとのプライベート空間)
            // 例: user/[userId]/profile/[timestamp]-[filename]
            const timestamp = Date.now();
            const key = `user/${userId}/profile/${timestamp}-${filename}`;

            // 【S3操作: GetSignedUrl (PutObject)】
            // - 目的: クライアントがブラウザから直接S3へファイルをアップロードするための署名付きURLを発行
            // - バケット: BUCKET_NAME
            // - キー: key
            // - 有効期限: 5分 (300秒)
            const command = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key,
                ContentType: contentType
            });

            const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
            const region = process.env.AWS_REGION || 'ap-northeast-1';
            const publicUrl = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;

            // フロントエンドでの即時プレビュー用に署名を付与 (読み取り用)
            const signedPublicUrl = await signUrlIfS3(publicUrl, BUCKET_NAME);

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ uploadUrl, publicUrl: signedPublicUrl, signedUrl: signedPublicUrl })
            };
        }

        // ====================================================================
        // ACTION: receiver_get (配送先デフォルト情報の取得)
        // ====================================================================
        if (action === 'receiver_get') {
            const pk = `USER#${userId}`;
            const sk = 'RECEIVER';

            // 【DB操作: GetItem】
            // - 目的: ログイン中のユーザーIDに紐づく配送先デフォルト情報を取得
            // - テーブル: TABLE_NAME (DynamoDB)
            // - キー構成:
            //   - PK: `USER#${userId}` (ユーザーID)
            //   - SK: 'RECEIVER' (配送先情報レコードの固定SK)
            // - 取得項目: レコードに含まれるすべての属性 (name, zipCode, address, phone, email, ts_created_at, ts_updated_at)
            const getRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: pk, SK: sk }
            }));

            if (!getRes.Item) {
                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ receiver_info: null }) };
            }

            const receiver_info = { ...getRes.Item };
            delete receiver_info.PK;
            delete receiver_info.SK;

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ receiver_info }) };
        }

        // ====================================================================
        // ACTION: receiver_update (配送先デフォルト情報の更新)
        // ====================================================================
        if (action === 'receiver_update') {
            const { receiver_info } = body;
            if (!receiver_info) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing receiver_info data' }) };
            }

            const pk = `USER#${userId}`;
            const sk = 'RECEIVER';

            // 更新対象のキーを除去
            const restrictedKeys = ['ts_created_at', 'ts_updated_at', 'PK', 'SK'];
            const keys = Object.keys(receiver_info).filter(k => !restrictedKeys.includes(k));

            if (keys.length === 0) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'No valid fields to update' }) };
            }

            // 【DB操作: UpdateItem】
            // - 目的: ログイン中のユーザーIDに紐づく配送先デフォルト情報を保存・更新
            // - テーブル: TABLE_NAME (DynamoDB)
            // - キー構成:
            //   - PK: `USER#${userId}` (ユーザーID)
            //   - SK: 'RECEIVER' (配送先情報レコードの固定SK)
            // - 更新内容:
            //   - ts_updated_at: 現在の日時をセット
            //   - ts_created_at: レコードがない場合、現在の日時をセット
            //   - #f{i}: receiver_info オブジェクトから渡された各属性 (name, zipCode, address, phone, email など)
            // - 更新戦略: 既存レコードがある場合は指定されたフィールドのみ更新、ない場合は新規作成 (Upsert)。
            //   restrictedKeys (ts_created_at, ts_updated_at, PK, SK) は意図せぬ変更を防ぐため除外。
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: pk, SK: sk },
                UpdateExpression: 'SET #ts_up = :now, #ts_cr = if_not_exists(#ts_cr, :now), ' +
                    keys.map((_, i) => `#f${i} = :v${i}`).join(', '),
                ExpressionAttributeNames: {
                    '#ts_up': 'ts_updated_at',
                    '#ts_cr': 'ts_created_at',
                    ...keys.reduce((acc, k, i) => ({ ...acc, [`#f${i}`]: k }), {})
                },
                ExpressionAttributeValues: {
                    ':now': new Date().toISOString(),
                    ...keys.reduce((acc, k, i) => ({ ...acc, [`:v${i}`]: receiver_info[k] }), {})
                }
            }));

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Receiver info updated successfully' }) };
        }

        // ====================================================================
        // ACTION: history_get (送信履歴と受信履歴の取得)
        // ====================================================================
        if (action === 'history_get') {
            const pk = `USER#${userId}`;

            // 【DB操作: Query】
            // - 目的: ログイン中のユーザーIDに紐づく全ての履歴ログ(SENDLOG / RECEIVEDLOG)を取得します。
            // - 特徴: 履歴はページング(SENDLOG#0, #1...)されている可能性があるため、前方一致検索(begins_with)で全件取得します。
            // - ソート: 各ログ内のタイムスタンプに基づいて降順に並べ替えます。
            const fetchLogs = async (logType: string) => {
                const queryRes = await ddb.send(new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
                    ExpressionAttributeValues: {
                        ':pk': pk,
                        ':skPrefix': `${logType}#`
                    }
                }));
                const allUuids: Array<{ uuid: string, timestamp: string }> = [];
                for (const item of queryRes.Items || []) {
                    if (item.logs && Array.isArray(item.logs)) {
                        allUuids.push(...item.logs);
                    }
                }
                // 最新順にソート
                allUuids.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                return allUuids;
            };

            const [sentLogs, receivedLogs] = await Promise.all([
                fetchLogs('SENDLOG'),
                fetchLogs('RECEIVEDLOG')
            ]);

            // === データ拡充処理 (Enrichment) ===
            // 履歴に含まれるUUIDから、PINコードや商品画像などの詳細情報を取得します。
            const allLogs = [...sentLogs, ...receivedLogs];
            const uniqueUuids = [...new Set(allLogs.map(l => l.uuid))];

            if (uniqueUuids.length > 0) {
                // 1. 【DB操作: BatchGetItem (QR METADATA)】
                // - 目的: 履歴にある各QRコードの基本設定(PIN, 紐付くショップ・商品・デザインID)を一括取得します。
                // - 制約対応: BatchGetItemの1回あたりの上限(100件)に合わせて分割実行します。
                const metadataMap = new Map<string, any>();
                const chunkedUuids = [];
                for (let i = 0; i < uniqueUuids.length; i += 100) {
                    chunkedUuids.push(uniqueUuids.slice(i, i + 100));
                }

                for (const chunk of chunkedUuids) {
                    const batchRes = await ddb.send(new BatchGetCommand({
                        RequestItems: {
                            [TABLE_NAME]: {
                                Keys: chunk.map(uuid => ({ PK: `QR#${uuid}`, SK: 'METADATA' }))
                            }
                        }
                    }));
                    if (batchRes.Responses && batchRes.Responses[TABLE_NAME]) {
                        for (const item of batchRes.Responses[TABLE_NAME]) {
                            const uuid = item.PK.replace('QR#', '');
                            metadataMap.set(uuid, item);
                        }
                    }
                }

                // 2. 【DB操作: BatchGetItem (PRODUCT)】
                // - 目的: ショップ・商品IDの組み合わせから、商品名と商品画像URLを取得します。
                // - 最適化: ProjectionExpression を使用し、必要な項目のみを読み取ることでコストを抑えます。
                const productMap = new Map<string, any>();
                const productKeys = Array.from(metadataMap.values())
                    .filter(m => m.shop_id && m.product_id)
                    .map(m => ({ PK: `SHOP#${m.shop_id}`, SK: `PRODUCT#${m.product_id}` }));

                const uniqueProductKeys = Array.from(new Set(productKeys.map(k => JSON.stringify(k)))).map(s => JSON.parse(s));

                if (uniqueProductKeys.length > 0) {
                    const chunkedProductKeys = [];
                    for (let i = 0; i < uniqueProductKeys.length; i += 100) {
                        chunkedProductKeys.push(uniqueProductKeys.slice(i, i + 100));
                    }
                    for (const chunk of chunkedProductKeys) {
                        const batchRes = await ddb.send(new BatchGetCommand({
                            RequestItems: {
                                [TABLE_NAME]: {
                                    Keys: chunk,
                                    ProjectionExpression: 'PK, SK, #name, image_url',
                                    ExpressionAttributeNames: { '#name': 'name' }
                                }
                            }
                        }));
                        if (batchRes.Responses && batchRes.Responses[TABLE_NAME]) {
                            for (const item of batchRes.Responses[TABLE_NAME]) {
                                const key = `${item.PK}_${item.SK}`;
                                // S3URLに署名を付与（プライベートバケットの画像を表示可能にする）
                                if (item.image_url) {
                                    item.image_url = await signUrlIfS3(item.image_url, BUCKET_NAME);
                                }
                                productMap.set(key, item);
                            }
                        }
                    }
                }

                // 3. 【DB操作: BatchGetItem (CARD_DESIGN)】
                // - 目的: デザインIDからカードの表面サムネイルURLを取得します。
                const designMap = new Map<string, any>();
                const designIds = [...new Set(Array.from(metadataMap.values()).map(m => m.card_design || m.design_id).filter(Boolean))];
                if (designIds.length > 0) {
                    const chunkedDesignIds = [];
                    for (let i = 0; i < designIds.length; i += 100) {
                        chunkedDesignIds.push(designIds.slice(i, i + 100));
                    }
                    for (const chunk of chunkedDesignIds) {
                        const batchRes = await ddb.send(new BatchGetCommand({
                            RequestItems: {
                                [TABLE_NAME]: {
                                    Keys: chunk.map(id => ({ PK: 'CARD_DESIGN#METADATA', SK: id })),
                                    ProjectionExpression: 'SK, thumbf'
                                }
                            }
                        }));
                        if (batchRes.Responses && batchRes.Responses[TABLE_NAME]) {
                            for (const item of batchRes.Responses[TABLE_NAME]) {
                                if (item.thumbf) {
                                    item.thumbf = await signUrlIfS3(item.thumbf, BUCKET_NAME);
                                }
                                designMap.set(item.SK, item);
                            }
                        }
                    }
                }

                // 4. 【DB操作: BatchGetItem (SHOP)】
                // - 目的: ショップIDからショップ名を取得します。
                const shopMap = new Map<string, any>();
                const shopIds = [...new Set(Array.from(metadataMap.values()).map(m => m.shop_id).filter(Boolean))];
                if (shopIds.length > 0) {
                    const chunkedShopIds = [];
                    for (let i = 0; i < shopIds.length; i += 100) {
                        chunkedShopIds.push(shopIds.slice(i, i + 100));
                    }
                    for (const chunk of chunkedShopIds) {
                        const batchRes = await ddb.send(new BatchGetCommand({
                            RequestItems: {
                                [TABLE_NAME]: {
                                    Keys: chunk.map(id => ({ PK: `SHOP#${id}`, SK: 'METADATA' })),
                                    ProjectionExpression: 'PK, #name',
                                    ExpressionAttributeNames: { '#name': 'name' }
                                }
                            }
                        }));
                        if (batchRes.Responses && batchRes.Responses[TABLE_NAME]) {
                            for (const item of batchRes.Responses[TABLE_NAME]) {
                                const sid = item.PK.replace('SHOP#', '');
                                shopMap.set(sid, item);
                            }
                        }
                    }
                }

                /**
                 * 取得した各マスターデータを用いてログ項目を拡充します。
                 */
                const enrich = (log: { uuid: string, timestamp: string }) => {
                    const meta = metadataMap.get(log.uuid);
                    if (!meta) return log;

                    const prodKey = `SHOP#${meta.shop_id}_PRODUCT#${meta.product_id}`;
                    const product = productMap.get(prodKey);
                    const design = designMap.get(meta.card_design || meta.design_id) || getSystemDesign(meta.card_design || meta.design_id);
                    const shop = shopMap.get(meta.shop_id);

                    return {
                        ...log,
                        pin: meta.pin,
                        product_name: product?.name,
                        product_image_url: product?.image_url,
                        card_design_thumbf: design?.thumbf,
                        shop_name: shop?.name
                    };
                };

                const enrichedSent = sentLogs.map(enrich);
                const enrichedReceived = receivedLogs.map(enrich);

                return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ sent: enrichedSent, received: enrichedReceived }) };
            }

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ sent: sentLogs, received: receivedLogs }) };
        }

        // ====================================================================
        // ACTION: history_sendgift (QRをスキャンして送信履歴に登録&紐付け)
        // ====================================================================
        if (action === 'history_sendgift') {
            const { uuid } = body;
            if (!uuid) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing UUID or PIN' }) };

            // 【DB操作: GetItem】
            // - 目的: スキャンされたQRコード(ギフト)が実在するか検証します。
            // - キー: PK=`QR#${uuid}`, SK='METADATA'
            const getRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'METADATA' }
            }));

            if (!getRes.Item) {
                return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'QR not found' }) };
            }

            // 【DB操作: UpdateItem】
            // - 目的: チャット管理レコード(CHAT)に送信者のユーザーIDを永続化します。
            // - 条件: sender_idが未設定である、または自分自身のIDである場合のみ更新を許可します（上書き防止）。
            // - キー: PK=`QR#${uuid}`, SK='CHAT'
            try {
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                    UpdateExpression: 'SET sender_id = :sid, ts_updated_at = :now',
                    ConditionExpression: 'attribute_not_exists(sender_id)',
                    ExpressionAttributeValues: { ':sid': userId, ':now': new Date().toISOString() }
                }));
            } catch (err: any) {
                if (err.name === 'ConditionalCheckFailedException') {
                    return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ message: 'Already registered as a sender' }) };
                }
                throw err;
            }

            // 【DB操作: 内部関数 appendToHistory 呼び出し】
            // - 目的: ユーザーの送信履歴(SENDLOG)に今回のギフトUUIDを追記します。
            // - 処理内容: SENDLOGレコード内の配列(logs)に、timestamp付きで新しいエントリをPUSHします。
            await appendToHistory(ddb, TABLE_NAME, userId, 'SENDLOG', uuid);

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Gift successfully linked to your sender profile' }) };
        }

        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Unknown action' }) };

    } catch (error: any) {
        console.error('User profile handler error:', error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error' }) };
    }
};
