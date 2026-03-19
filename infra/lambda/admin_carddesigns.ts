/**
 * 概要: カードデザイン（背景画像、サムネイルなど）の管理を行う。
 * 詳細: デザインの一覧取得、新規作成、更新、削除、およびS3への画像アップロード用URLの生成を担当する。
 * エンドポイント:
 *  - POST /admin/carddesigns/list: 全デザインの一覧取得
 *  - POST /admin/carddesigns/create: 新規作成 (body: { design: { ... } })
 *  - POST /admin/carddesigns/uploadurl: アップロードURL発行 (body: { filename, contentType, design_id })
 *  - POST /admin/carddesigns/update: 更新 (body: { design_id, design: { ... } })
 *  - POST /admin/carddesigns/delete: 削除 (body: { design_id })
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { generateId } from './utils/id';
import { stripSignature, signUrlIfS3, localizeS3Image, deleteFolderFromS3, getPresignedViewUrl } from './utils/s3';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const s3 = new S3Client({});

const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') {
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'OK' }) };
        }
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
        }

        const path = event.path;

        // 1. List All Designs (POST /admin/carddesigns/list)
        if (path.endsWith('/list')) {
            const body = JSON.parse(event.body || '{}');
            // 全てのカードデザインのメタデータを検索
            // - 検索条件: PK = "CARD_DESIGN#METADATA" (全デザイン共通のPK)
            // - 取得カラム: 項目の全ての属性 (背景画像URL、タイトル等)
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk',
                ExpressionAttributeValues: {
                    ':pk': 'CARD_DESIGN#METADATA'
                }
            }));
            const items = res.Items || [];

            // Sign URLs for preview
            for (const item of items) {
                if (item.bgimgf) item.bgimgf = await signUrlIfS3(item.bgimgf, BUCKET_NAME);
                if (item.bgimgb) item.bgimgb = await signUrlIfS3(item.bgimgb, BUCKET_NAME);
                if (item.thumbf) item.thumbf = await signUrlIfS3(item.thumbf, BUCKET_NAME);
                if (item.thumbb) item.thumbb = await signUrlIfS3(item.thumbb, BUCKET_NAME);
            }

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ items }) };
        }

        // 2. Create Design (POST /admin/carddesigns/create)
        if (path.endsWith('/create')) {
            const body = JSON.parse(event.body || '{}');
            const designId = body.design_id || generateId();
            const design = body.design;
            if (!designId || !design) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing params' }) };
            }
            const now = new Date().toISOString();

            const item = {
                ...design,
                PK: 'CARD_DESIGN#METADATA',
                SK: designId,
                design_id: designId,
                ts_created_at: now,
                ts_updated_at: now
            };

            // Clean signatures and localize images to standardized paths
            if (item.bgimgf) item.bgimgf = await localizeS3Image(item.bgimgf, BUCKET_NAME, designId, 'front');
            if (item.bgimgb) item.bgimgb = await localizeS3Image(item.bgimgb, BUCKET_NAME, designId, 'back');
            if (item.thumbf) item.thumbf = await localizeS3Image(item.thumbf, BUCKET_NAME, designId, 'thumbf');
            if (item.thumbb) item.thumbb = await localizeS3Image(item.thumbb, BUCKET_NAME, designId, 'thumbb');

            try {
                // カードデザインのメタデータを新規作成または上書き
                // - PK: "CARD_DESIGN#METADATA" (全デザイン共通のPK)
                // - SK: designId (各デザイン固有のID)
                // - 登録項目 (Item): designオブジェクトの各属性、design_id、作成日時(ts_created_at)、更新日時(ts_updated_at)
                await ddb.send(new PutCommand({
                    TableName: TABLE_NAME,
                    Item: item
                }));
            } catch (err: any) {
                console.error("DynamoDB Put Error:", err);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'Database creation failed', error: err.message })
                };
            }

            return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ design_id: designId, message: 'Design created' }) };
        }

        // 3. Get Upload URL (POST /admin/carddesigns/uploadurl)
        if (path.endsWith('/uploadurl')) {
            const body = JSON.parse(event.body || '{}');
            const { filename, contentType, design_id } = body;
            if (!filename || !contentType || !design_id) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing params' }) };
            }

            const tempId = generateId();
            const key = `temp/card-designs/${design_id}/${tempId}_${filename}`;
            const command = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key,
                ContentType: contentType
            });

            const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

            // Also get a signed VIEW URL so the frontend can show it immediately
            const signedViewUrl = await getPresignedViewUrl(BUCKET_NAME, key, 3600);

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ uploadUrl, publicUrl: signedViewUrl }) };
        }

        // 4. Update Design (POST /admin/carddesigns/update)
        if (path.endsWith('/update')) {
            const body = JSON.parse(event.body || '{}');
            const designId = body.design_id;
            const design = body.design;
            if (!designId || !design) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing params' }) };
            }
            const now = new Date().toISOString();

            // Localize images and strip signatures
            if (design.bgimgf) design.bgimgf = await localizeS3Image(design.bgimgf, BUCKET_NAME, designId, 'front');
            if (design.bgimgb) design.bgimgb = await localizeS3Image(design.bgimgb, BUCKET_NAME, designId, 'back');
            if (design.thumbf) design.thumbf = await localizeS3Image(design.thumbf, BUCKET_NAME, designId, 'thumbf');
            if (design.thumbb) design.thumbb = await localizeS3Image(design.thumbb, BUCKET_NAME, designId, 'thumbb');

            const updateExprParts: string[] = [];
            const attrValues: any = { ':now': now };
            const attrNames: any = {};

            Object.entries(design).forEach(([key, value]) => {
                if (['PK', 'SK', 'design_id', 'ts_created_at', 'ts_updated_at'].includes(key)) return;
                if (value === undefined) return;
                const attrKey = `#${key}`;
                const valKey = `:${key}`;
                updateExprParts.push(`${attrKey} = ${valKey}`);
                attrNames[attrKey] = key;
                attrValues[valKey] = value === "" ? null : value; // Convert empty strings to null for DynamoDB safety
            });

            attrNames['#ts_updated_at'] = 'ts_updated_at';

            try {
                // 既存のカードデザインのメタデータを一部更新
                // - 検索条件: PK = "CARD_DESIGN#METADATA", SK = designId
                // - 更新内容: リクエストに含まれるdesignオブジェクトの各属性 (属性名の競合回避のため ExpressionAttributeNames を使用)
                // - 必須更新カラム: ts_updated_at (最終更新日時を現在時刻に設定)
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: 'CARD_DESIGN#METADATA', SK: designId },
                    UpdateExpression: `SET ${updateExprParts.length > 0 ? updateExprParts.join(', ') + ', ' : ''} #ts_updated_at = :now`,
                    ExpressionAttributeNames: attrNames,
                    ExpressionAttributeValues: attrValues
                }));
            } catch (err: any) {
                console.error("DynamoDB Update Error:", err);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'Database update failed', error: err.message, details: err.stack })
                };
            }

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Design updated' }) };
        }

        // 5. Delete Design (DELETE /admin/carddesigns/delete)
        if (path.endsWith('/delete')) {
            const body = JSON.parse(event.body || '{}');
            const designId = body.design_id;
            if (!designId) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing params' }) };
            }
            // 指定したIDのカードデザインを削除
            // - 検索条件: PK = "CARD_DESIGN#METADATA", SK = designId
            // - 削除対象: 当該メタデータ項目全体
            await ddb.send(new DeleteCommand({
                TableName: TABLE_NAME,
                Key: { PK: 'CARD_DESIGN#METADATA', SK: designId }
            }));

            // Recursive S3 deletion of the design folder
            await deleteFolderFromS3(BUCKET_NAME, `admin/card-designs/${designId}/`);

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Design deleted' }) };
        }

        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };

    } catch (error: any) {
        console.error(error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error', error: error.message })
        };
    }
};
