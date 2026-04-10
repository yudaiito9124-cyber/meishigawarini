#!/usr/bin/env node
/**
 * @file infra.ts
 * @role CDK アプリケーション・エントリポイント
 * @responsibility
 *  - AWS CDK アプリケーションの初期化とスタックのインスタンス化を管理します。
 *  - 【環境の分離と切り替え】
 *    `cdk deploy -c stage=stg` のようにコンテキスト変数を受け取り、それに応じた `.env.{stage}` ファイルの読み込みとスタック ID の動的生成を行います。
 *  - 【デプロイ先環境の固定】
 *    本番環境のデプロイミスを防ぐため、特定の AWS アカウントおよびリージョン（ap-northeast-1）を明示的に指定しています。
 * @context
 *  - `npm run deploy:stg` 等のコマンドから呼び出され、インフラ構築の起点となります。
 */

import * as cdk from 'aws-cdk-lib';
import * as path from 'path';

// .env ファイルからの環境変数読み込み
import { InfraStack } from '../lib/infra-stack';

const app = new cdk.App();

/**
 * デプロイステージの決定
 * デフォルトは 'stage'。CDK コンテキスト (-c stage=...) から取得します。
 */
const stage = app.node.tryGetContext('prod') || 'stage';
const envPath = path.join(__dirname, `../.env.${stage}`);
require('dotenv').config({ path: envPath });

/** スタック ID の命名規則: prod は単一、それ以外はサフィックスを付加 */
const stackId = stage === 'prod' ? 'InfraStack' : `InfraStack-${stage}`;

new InfraStack(app, stackId, {
  /** 
   * 動作環境の定義
   * リージョン依存の機能（特定の 既存リソースの import 等）を正しく動作させるため、
   * アカウント ID とリージョンをハードコードしています。
   */
  env: { account: '591402270136', region: 'ap-northeast-1' },
  stage: stage,
} as any);
