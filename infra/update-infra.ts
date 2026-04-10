/**
 * @file update-infra.ts
 * @role インフラ構成自動修正（パッチ）スクリプト
 * @responsibility
 *  - CDK スタックの定義ファイル (`infra-stack.ts`) を直接読み書きし、特定の構成（Cognito ティアや認証フロー）をプログラムから書き換えます。
 *  - マニュアルでの書き換えミスを防ぎ、一貫した状態でデプロイ環境を整えるための補助ツールです。
 * @context
 *  - 特に Cognito の パスキー (WebAuthn) 対応に必要な ESSENTIALS ティアへの移行や、`ALLOW_USER_AUTH` フローの有効化を自動化するために使用されます。
 */

import fs from 'fs';

const path = 'c:/git/meishigawarini/infra/lib/infra-stack.ts';
let content = fs.readFileSync(path, 'utf8');

const target = `    const userPoolClient = new cognito.UserPoolClient(this, 'MeishiGawariniUserPoolClient', {
      userPool,
      authFlows: { userSrp: true },
    });`;

const replacement = `    // パスキー (WebAuthn) 対応のために Essentials ティアに設定
    const cfnUserPool = userPool.node.defaultChild as cognito.CfnUserPool;
    cfnUserPool.userPoolTier = 'ESSENTIALS';

    const userPoolClient = new cognito.UserPoolClient(this, 'MeishiGawariniUserPoolClient', {
      userPool,
      authFlows: { userSrp: true },
    });

    // ALLOW_USER_AUTH を有効化 (パスキー / WebAuthn に必要)
    const cfnUserPoolClient = userPoolClient.node.defaultChild as cognito.CfnUserPoolClient;
    cfnUserPoolClient.explicitAuthFlows = [
      'ALLOW_USER_SRP_AUTH',
      'ALLOW_REFRESH_TOKEN_AUTH',
      'ALLOW_USER_AUTH'
    ];`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Successfully updated infra-stack.ts');
} else {
  console.error('Target content not found');
  process.exit(1);
}
