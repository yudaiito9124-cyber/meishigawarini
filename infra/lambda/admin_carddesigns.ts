/**
 * @file admin_carddesigns.ts
 * @role 管理者用：カードデザイン管理ハンドラー
 * @responsibility
 *  - サービスの核となる「カードデザイン（テンプレート）」の登録・編集・削除を管理します。
 *  - デザインメタデータ（PK: CARD_DESIGN#METADATA）の DynamoDB 管理。
 *  - 【アセット管理】アップロードされた一時的な画像ファイルを、デザイン ID に基づく恒久的なディレクトリへ移動・正規化（localize）します。
 *  - 【削除安全】デザイン削除時、関連する全画像（表面、裏面、サムネイル）を S3 から一括削除し、ストレージのクリーンネスを維持します。
 * @context
 *  - ここで登録されたデザインが、各ショップのギフト設定やユーザーのカード選択画面に反映されます。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { PutCommand, QueryCommand, GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { generateId } from './utils/id';
import { signUrlIfS3, stripSignature, deleteFileByUrl, localizeS3Image, getPresignedViewUrl, deleteFolderFromS3, s3Client } from './utils/s3';
import { successResponse, errorResponse, apiResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getAction, getUserId } from './utils/request';
import { AdminApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const userId = getUserId(event);
        let action = getAction(event, body);

        if (!userId) return errorResponse(401, 'Unauthorized');

        // パスベースのルーティング互換性（Admin UI からの移行対応）
        const resPath = event.resource;
        if (resPath.endsWith('/list')) action = 'list';
        else if (resPath.endsWith('/create')) action = 'create';
        else if (resPath.endsWith('/update')) action = 'update';
        else if (resPath.endsWith('/delete')) action = 'delete';
        else if (resPath.endsWith('/uploadurl')) action = 'uploadurl';

        const now = new Date().toISOString();

        // --------------------------------------------------------------------
        // ACTION: list (全デザインの一覧取得)
        // --------------------------------------------------------------------
        // 目的: 登録されている全てのカードデザインを取得し、画像を表示可能（署名付き）にして返却します。
        // --------------------------------------------------------------------
        if (action === 'list') {
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk',
                ExpressionAttributeValues: { ':pk': 'CARD_DESIGN#METADATA' }
            }));

            const items = res.Items || [];

            const signedItems = await Promise.all(items.map(async (item) => {
                const d = { ...item };
                // S3 パスを一時的な署名付き URL に変換（UI 表示用）
                if (d.thumbf) d.thumbf = await signUrlIfS3(d.thumbf, BUCKET_NAME);
                if (d.thumbb) d.thumbb = await signUrlIfS3(d.thumbb, BUCKET_NAME);
                if (d.bgimgf) d.bgimgf = await signUrlIfS3(d.bgimgf, BUCKET_NAME);
                if (d.bgimgb) d.bgimgb = await signUrlIfS3(d.bgimgb, BUCKET_NAME);
                return d;
            }));

            return successResponse({ items: signedItems });
        }

        // --------------------------------------------------------------------
        // ACTION: create (新規デザイン作成)
        // --------------------------------------------------------------------
        // 目的: 新しいデザインメタデータを保存し、画像を恒久パスへ移動します。
        // ローカリゼーション: localizeS3Image() により、temp ディレクトリの画像を admin/card-designs/<id>/ へ自動移動。
        // --------------------------------------------------------------------
        if (action === 'create') {
            const { design, design_id } = body as AdminApiSchema['admin_carddesigns_create'];
            const finalDesignId = design_id || generateId();
            if (!design) return errorResponse(400, 'Missing design data');

            const item: any = {
                ...design,
                PK: 'CARD_DESIGN#METADATA',
                SK: finalDesignId,
                design_id: finalDesignId,
                ts_created_at: now,
                ts_updated_at: now
            };

            // 画像のローカライズ (デザインIDごとの恒久ディレクトリへ移動)
            // これにより、一時ディレクトリのクレンジングを不要にし、アセットの所有権を明確にします。
            if (item.bgimgf) item.bgimgf = await localizeS3Image(item.bgimgf, BUCKET_NAME, finalDesignId, 'front');
            if (item.bgimgb) item.bgimgb = await localizeS3Image(item.bgimgb, BUCKET_NAME, finalDesignId, 'back');
            if (item.thumbf) item.thumbf = await localizeS3Image(item.thumbf, BUCKET_NAME, finalDesignId, 'thumbf');
            if (item.thumbb) item.thumbb = await localizeS3Image(item.thumbb, BUCKET_NAME, finalDesignId, 'thumbb');

            await ddb.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: item
            }));

            return apiResponse(201, { design_id: finalDesignId, message: 'Card design created' });
        }

        // --------------------------------------------------------------------
        // ACTION: uploadurl (アップロード用 URL の取得)
        // --------------------------------------------------------------------
        // 目的: S3 へのセーフな画像アップロードを許可するため、Presigned URL を発行します。
        // 格納先: まずは `temp/` 領域に保存され、保存(create/update)アクション時に `admin/` 領域へ移動されます。
        // --------------------------------------------------------------------
        if (action === 'uploadurl') {
            const { filename, content_type, design_id } = body as AdminApiSchema['admin_carddesigns_uploadurl'];
            if (!filename || !content_type || !design_id) return errorResponse(400, 'Missing params');

            const tempId = generateId();
            const key = `temp/card-designs/${design_id}/${tempId}_${filename}`;
            const command = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key,
                ContentType: content_type
            });

            const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
            const signedViewUrl = await getPresignedViewUrl(BUCKET_NAME, key, 3600);

            return successResponse({ uploadUrl, publicUrl: signedViewUrl });
        }

        // --------------------------------------------------------------------
        // ACTION: update (既存デザインの更新)
        // --------------------------------------------------------------------
        // 目的: メタデータの変更、および画像の差し替えを処理します。
        // 動的生成: 入力があったフィールドのみを SET 句に含めることで、不必要なデータの上書き・削除を防止します。
        // --------------------------------------------------------------------
        if (action === 'update') {
            const { design_id, design } = body as AdminApiSchema['admin_carddesigns_update'];
            if (!design_id || !design) return errorResponse(400, 'Missing design_id or design data');

            // 差し替え画像のローカライズ
            if (design.bgimgf) design.bgimgf = await localizeS3Image(design.bgimgf, BUCKET_NAME, design_id, 'front');
            if (design.bgimgb) design.bgimgb = await localizeS3Image(design.bgimgb, BUCKET_NAME, design_id, 'back');
            if (design.thumbf) design.thumbf = await localizeS3Image(design.thumbf, BUCKET_NAME, design_id, 'thumbf');
            if (design.thumbb) design.thumbb = await localizeS3Image(design.thumbb, BUCKET_NAME, design_id, 'thumbb');

            // 更新式の動的構築
            const updateExprParts: string[] = [];
            const attrValues: any = { ':now': now };
            const attrNames: any = { '#ts_up': 'ts_updated_at' };

            Object.entries(design).forEach(([key, value]) => {
                if (['PK', 'SK', 'design_id', 'ts_created_at', 'ts_updated_at'].includes(key)) return;
                if (value === undefined) return;
                const attrKey = `#${key}`;
                const valKey = `:${key}`;
                updateExprParts.push(`${attrKey} = ${valKey}`);
                attrNames[attrKey] = key;
                attrValues[valKey] = value === "" ? null : value;
            });

            if (updateExprParts.length === 0) return errorResponse(400, 'No fields to update');

            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: 'CARD_DESIGN#METADATA', SK: design_id },
                UpdateExpression: `SET ${updateExprParts.join(', ')}, #ts_up = :now`,
                ExpressionAttributeNames: attrNames,
                ExpressionAttributeValues: attrValues
            }));

            return successResponse({ message: 'Card design updated' });
        }

        // --------------------------------------------------------------------
        // ACTION: delete (デザインの物理削除)
        // --------------------------------------------------------------------
        // 目的: メタデータと S3 ストレージの両方からデザインを削除します。
        // ストレージクリーンアップ: deleteFolderFromS3() により、そのデザイン専用の S3 サブディレクトリを再帰的に全消去します。
        // --------------------------------------------------------------------
        if (action === 'delete') {
            const { design_id } = body as AdminApiSchema['admin_carddesigns_delete'];
            if (!design_id) return errorResponse(400, 'Missing design_id');

            // 1. DB レコード消去
            await ddb.send(new DeleteCommand({
                TableName: TABLE_NAME,
                Key: { PK: 'CARD_DESIGN#METADATA', SK: design_id }
            }));

            // 2. S3 ストレージ消去 (再帰削除)
            await deleteFolderFromS3(BUCKET_NAME, `admin/card-designs/${design_id}/`);

            return successResponse({ message: 'Card design deleted' });
        }

        return errorResponse(404, 'Unknown action');

    } catch (error: any) {
        console.error('Admin card designs error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
