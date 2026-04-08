/**
 * @file db.ts
 * @description 
 * 本システム全体（主に Lambda 関数群）で共有される DynamoDB クライアントおよび
 * 環境変数定義を管理するコアモジュールです。
 * 
 * データベース操作の規格化を目指し、marshallOptions の設定（undefined 除外等）を
 * 統一することで、保存時のランタイムエラーを物理的に防ぐ「フールプルーフ」な設計としています。
 * 
 * @responsibility
 * - AWS SDK v3 を使用した DynamoDB クライアントの初期化。
 * - システム共通のテーブル名、バケット名、ユーザープール ID の提供。
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * 共通の DynamoDB クライアント（低レベル）の初期化
 */
const client = new DynamoDBClient({});

/**
 * 共有の DynamoDBDocumentClient
 * 
 * 【規格化・機械的な操作の容易化のための設定】
 * - removeUndefinedValues: true
 *   JavaScript の undefined なプロパティを自動的にパージします。
 *   これにより「存在しない値」を DynamoDB に書き込もうとした際のエラーを機械的に防ぎます。
 * 
 * - convertEmptyValues: true
 *   空文字を Null または適切な形式に自動変換（旧 SDK 互換）し、書き込みエラーを抑止します。
 */
export const ddb = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true
    }
});

/**
 * 環境変数のエクスポート
 * インフラ（CDK/Terraform等）から注入される値を、各 Lambda 関数で機械的に利用できるようにします。
 */
export const TABLE_NAME = process.env.TABLE_NAME || '';
export const BUCKET_NAME = process.env.BUCKET_NAME || '';
export const USER_POOL_ID = process.env.USER_POOL_ID || '';
