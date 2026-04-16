/**
 * @file db.ts
 * @role 共通データベース・インフラ定数管理モジュール
 * @responsibility
 *  - AWS SDK v3 を使用した DynamoDBDocumentClient の初期化と共有。
 *  - 環境変数（テーブル名、バケット名等）の中央管理と提供。
 *  - データベース操作におけるランタイムエラーを防止するためのマーシャリング設定（removeUndefinedValues 等）。
 * @context
 *  - 全ての Lambda 関数からインポートされ、一貫した DB クライアント・定数として利用されます。
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * 低レベル DynamoDB クライアントの初期化
 * リージョン等は実行環境（Lambda 環境変数）から自動的に取得されます。
 */
const client = new DynamoDBClient({});

/**
 * 共有の DynamoDBDocumentClient
 * 
 * 【フールプルーフ設計と規格化】
 * - marshallOptions.removeUndefinedValues: true
 *   JavaScript の `undefined` を検知した際、DynamoDB への書き込み時にその属性を自動的に除外します。
 *   これにより、「値が存在しない」状態を安全に表現し、DynamoDB のバリデーションエラーを機械的に防ぎます。
 * 
 * - marshallOptions.convertEmptyValues: true
 *   空の文字列、バイナリ、セットを自動的に Null または適切な形式に変換します（旧 SDK 互換）。
 *   意図しない空文字の混入による書き込み制限エラーを抑止します。
 */
export const ddb = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true
    }
});

/**
 * システム共通定数 (環境変数経由)
 * インフラ（AWS CDK）から Lambda 関数に注入された値を、アプリケーションコード内で型安全に利用できるようにします。
 */

/** 主ストレージとなる DynamoDB テーブル名 */
export const TABLE_NAME = process.env.TABLE_NAME || '';

/** ファイル（画像、カードデザイン等）を保存する S3 バケット名 */
export const BUCKET_NAME = process.env.BUCKET_NAME || '';

/** Cognito ユーザープールの ID (ユーザー検索や管理操作用) */
export const USER_POOL_ID = process.env.USER_POOL_ID || '';
