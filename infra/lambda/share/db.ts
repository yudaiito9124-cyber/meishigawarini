import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});

/**
 * 共有の DynamoDBDocumentClient
 * - removeUndefinedValues: true により、undefined な値を自動的に除外して保存エラーを防ぎます。
 * - convertEmptyValues: true により、空文字なども適切に処理します。
 */
export const ddb = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true
    }
});

export const TABLE_NAME = process.env.TABLE_NAME || '';
export const BUCKET_NAME = process.env.BUCKET_NAME || '';
export const USER_POOL_ID = process.env.USER_POOL_ID || '';
