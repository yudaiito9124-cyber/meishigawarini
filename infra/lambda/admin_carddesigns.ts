/**
 * 概要: カードデザイン管理（管理者用）
 * 詳細: 
 *  - 全デザイン(CARD_DESIGN#METADATA)の一覧取得、新規登録、詳細更新、および削除を管理します。
 *  - 各デザインは、表面(front)と裏面(back)の画像パス、サムネイル画像、説明文などを保持します。
 *  - S3アップロード後は localizeS3Image により、デザインIDに基づいた恒久的なパスへ自動移動されます。
 *
 * エンドポイント: POST /admin/carddesigns
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

        // パスベースのルーティング互換性
        const resPath = event.resource;
        if (resPath.endsWith('/list')) action = 'list';
        else if (resPath.endsWith('/create')) action = 'create';
        else if (resPath.endsWith('/update')) action = 'update';
        else if (resPath.endsWith('/delete')) action = 'delete';
        else if (resPath.endsWith('/uploadurl')) action = 'uploadurl';

        const now = new Date().toISOString();

        // ====================================================================
        // ACTION: list (全デザインの一覧取得)
        // --------------------------------------------------------------------
        // 目的: 管理画面やユーザー選択画面での表示用に、登録済み全デザインをリストアップします。
        // ====================================================================
        if (action === 'list') {
            const {} = body as AdminApiSchema['admin_carddesigns_list'];
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk',
                ExpressionAttributeValues: { ':pk': 'CARD_DESIGN#METADATA' }
            }));

            const items = res.Items || [];

            const signedItems = await Promise.all(items.map(async (item) => {
                const d = { ...item };
                if (d.thumbf) d.thumbf = await signUrlIfS3(d.thumbf, BUCKET_NAME);
                if (d.thumbb) d.thumbb = await signUrlIfS3(d.thumbb, BUCKET_NAME);
                if (d.bgimgf) d.bgimgf = await signUrlIfS3(d.bgimgf, BUCKET_NAME);
                if (d.bgimgb) d.bgimgb = await signUrlIfS3(d.bgimgb, BUCKET_NAME);
                return d;
            }));

            return successResponse({ items: signedItems });
        }

        // ====================================================================
        // ACTION: create (新規デザイン作成)
        // --------------------------------------------------------------------
        // 目的: 新規デザインを登録し、アセットを恒久ディレクトリへ移動(localize)します。
        // ====================================================================
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

        // ====================================================================
        // ACTION: uploadurl (アップロード用URLの取得)
        // --------------------------------------------------------------------
        // 目的: デザインアセットのアップロード先URLを発行します。
        // ====================================================================
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

        // ====================================================================
        // ACTION: update (既存デザインの更新)
        // --------------------------------------------------------------------
        // 目的: デザイン属性を部分更新し、必要に応じてアセットを再ローカライズします。
        // ====================================================================
        if (action === 'update') {
            const { design_id, design } = body as AdminApiSchema['admin_carddesigns_update'];
            if (!design_id || !design) return errorResponse(400, 'Missing design_id or design data');

            // ローカライズ処理
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

        // ====================================================================
        // ACTION: delete (デザインの削除)
        // --------------------------------------------------------------------
        // 目的: デザイン項目を削除し、S3上の関連フォルダを一括削除します。
        // ====================================================================
        if (action === 'delete') {
            const { design_id } = body as AdminApiSchema['admin_carddesigns_delete'];
            if (!design_id) return errorResponse(400, 'Missing design_id');

            await ddb.send(new DeleteCommand({
                TableName: TABLE_NAME,
                Key: { PK: 'CARD_DESIGN#METADATA', SK: design_id }
            }));

            // S3上のデザイン専用フォルダを再帰削除
            await deleteFolderFromS3(BUCKET_NAME, `admin/card-designs/${design_id}/`);

            return successResponse({ message: 'Card design deleted' });
        }

        return errorResponse(404, 'Unknown action');

    } catch (error: any) {
        console.error('Admin card designs error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
