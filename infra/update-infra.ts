
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
