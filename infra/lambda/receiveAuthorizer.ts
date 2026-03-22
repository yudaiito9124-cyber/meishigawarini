import { APIGatewayAuthorizerResult, APIGatewayRequestAuthorizerEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { isLocked, getRateLimitUpdate, getResetRateLimitUpdate } from './utils/rate-limit';

const TABLE_NAME = process.env.TABLE_NAME || '';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true
    }
});

export const handler = async (event: APIGatewayRequestAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
    try {
        const uuid = event.headers?.['x-qr-uuid'] || event.headers?.['X-QR-UUID'];
        const pin = event.headers?.['x-qr-pin'] || event.headers?.['X-QR-PIN'];

        if (!uuid || !pin) {
            console.log('Missing UUID or PIN in headers');
            return generatePolicy('unidentified-receiver', 'Deny', event.methodArn);
        }

        const getRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: `QR#${uuid}`,
                SK: 'METADATA'
            }
        }));

        if (!getRes.Item) {
            console.log(`QR not found: ${uuid}`);
            return generatePolicy(`receiver-${uuid}`, 'Deny', event.methodArn);
        }

        const item = getRes.Item;


        if (item.status !== 'PROMOTION') {
            // 1. 状態チェック (Banned / Closed etc)
            if (item.ts_banned_at) {
                console.log(`QR is banned: ${uuid}`);
                return generatePolicy(`receiver-${uuid}`, 'Deny', event.methodArn);
            }

            // 2. Lockチェック
            if (isLocked(item)) {
                console.log(`QR is locked: ${uuid}`);
                return generatePolicy(`receiver-${uuid}`, 'Deny', event.methodArn, { locked: 'true' });
            }

            // 2. PIN検証
            if (String(item.pin) !== String(pin)) {
                console.log(`Invalid PIN for QR: ${uuid}`);

                // 失敗回数のカウントアップ (Side Effect)
                const { UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames } = getRateLimitUpdate(item);
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                    UpdateExpression,
                    ExpressionAttributeValues,
                    ExpressionAttributeNames
                }));

                return generatePolicy(`receiver-${uuid}`, 'Deny', event.methodArn);
            }

            // 3. 成功時：失敗回数のリセット (もしあれば)
            if (item.failed_attempts || item.locked_until) {
                const { UpdateExpression, ExpressionAttributeNames } = getResetRateLimitUpdate();
                try {
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${uuid}`, SK: 'METADATA' },
                        UpdateExpression,
                        ExpressionAttributeNames
                    }));
                } catch (e) {
                    console.error("Failed to reset rate limit:", e);
                }
            }

        } else {
            // 4. PROMOTIONステータス時の制限 (情報取得系のみ許可)
            const methodArnParts = event.methodArn.split('/');
            const path = methodArnParts.slice(3).join('/');

            const allowedPaths = [
                'receive/chat/get',
                'receive/sender/load'
            ];

            if (!allowedPaths.includes(path)) {
                console.log(`PROMOTION status restricted access to: ${path}`);
                return generatePolicy(`receiver-${uuid}`, 'Deny', event.methodArn);
            }
        }


        // 5. ポリシーの生成 (Allow)
        const stageArn = event.methodArn.split('/').slice(0, 2).join('/');
        let policyResource: string | string[];

        if (item.status === 'PROMOTION') {
            // PROMOTION(プロモーション用のQRコード)の場合は特定の取得系エンドポイントのみを許可
            policyResource = [
                `${stageArn}/POST/receive/chat/get`,
                `${stageArn}/POST/receive/sender/load`
            ];
        } else {
            // 通常は /receive/* 配下すべてを許可 (他の /admin/ などは含めない)
            policyResource = `${stageArn}/*/receive/*`;
        }

        return generatePolicy(`receiver-${uuid}`, 'Allow', policyResource, {
            uuid: uuid,
            pin: pin,
            status: item.status,
            shopId: item.shop_id
        });

    } catch (err) {
        console.error('Authorization failed:', err);
        return generatePolicy('authorization-failed', 'Deny', event.methodArn);
    }
};

/**
 * API Gateway に返すための認可ポリシーを生成する
 * @param principalId ユーザーを一意に識別するID (ログやメトリクスで使用)
 * @param effect 'Allow' (許可) または 'Deny' (拒否)
 * @param resource リクエストされたリソースのARN
 * @param context 後続のLambdaハンドラーに引き継ぐ追加情報
 */
function generatePolicy(principalId: string, effect: string, resource: string | string[], context?: any): APIGatewayAuthorizerResult {
    const authResponse: any = {
        principalId,
        policyDocument: {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: effect,
                    // 特定のURLだけでなく、このAPIステージ全体へのアクセスを許可する (キャッシュ対策)
                    // 例: arn:aws:execute-api:region:account:api-id/stage/*
                    Resource: resource,
                },
            ],
        },
    };

    if (context) {
        authResponse.context = context; // 後続の Lambda で event.requestContext.authorizer.[key] として取得可能
    }

    return authResponse;
}
