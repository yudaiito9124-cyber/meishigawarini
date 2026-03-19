/**
 * 概要: 指定された複数のパーティションキー（PK）に紐付くデータを一括でダンプする。
 * 詳細: デバッグやデータメンテナンスを目的として、指定されたPKのリストに対して全ソートキー（SK）のアイテムを検索して返す。
 * エンドポイント: POST /admin/dump
 * リクエストボディ:
 *  - pks: 取得対象のPK（Partition Key）の配列 (例: ["SHOP#uuid", "USER#uuid"])
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || '';

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

        const body = JSON.parse(event.body || '{}');
        const pks = body.pks;

        if (!Array.isArray(pks)) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'pks is required' })
            };
        }

        let items: any[] = [];

        for (const pk of pks) {
            // 指定されたPKに紐付く全てのソートキー（SK）のアイテムを検索
            // - 検索条件: PK = pk (リクエストで指定された各PK)
            // - 取得カラム: 項目の全ての属性
            const res = await ddb.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk',
                ExpressionAttributeValues: {
                    ':pk': pk
                }
            }));
            items = items.concat(res.Items || []);
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ items })
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Internal Server Error', error: String(error) })
        };
    }
};
