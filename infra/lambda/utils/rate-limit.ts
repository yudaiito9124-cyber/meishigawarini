/**
 * @file rate-limit.ts
 * @role ブルートフォース攻撃防止・レート制限ユーティリティ
 * @responsibility
 *  - PIN コードの入力試行回数を管理し、短期間の連続試行をブロックします。
 *  - ロック状態の判定および、DynamoDB 更新用のパラメータ構築を行います。
 * @context
 *  - QR コードの認証（receive_verify）等、秘密情報へのアクセスが発生するアクションで、セキュリティレイヤーとして機能します。
 */

import { UpdateCommandInput } from '@aws-sdk/lib-dynamodb';

/** レート制限のデフォルト設定 */
export interface RateLimitConfig {
    /** ロックするまでの最大試行回数 */
    maxAttempts: number;
    /** ロックの持続時間（秒）。初期値 30 分。 */
    lockDurationSeconds: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
    maxAttempts: 5,
    lockDurationSeconds: 1800 // 30 minutes
};

/**
 * 対象アイテムが現在ロック（制限中）であるかを確認します。
 * 
 * @param item - DynamoDB から取得したメタデータ項目。
 * @returns 現在時刻が `locked_until` を過ぎていなければ true を返します。
 */
export const isLocked = (item: any): boolean => {
    if (!item) return false;

    // ロック期限が設定されているかチェック
    if (item.locked_until) {
        const now = new Date();
        const lockedUntil = new Date(item.locked_until);
        if (now < lockedUntil) {
            return true;
        }
    }
    return false;
};

/**
 * 試行失敗時に、DynamoDB のカウンタを増やすための更新パラメータを構築します。
 * 
 * @description
 * 試行回数が `maxAttempts` に達した場合、自動的に `locked_until` を現在時刻 + `lockDurationSeconds` に設定します。
 * 
 * @param item - 現在のデータベース項目。
 * @param config - レート制限の設定。
 * @returns UpdateCommand 用の式と属性定義。
 */
export const getRateLimitUpdate = (
    item: any,
    config: RateLimitConfig = DEFAULT_CONFIG
): {
    UpdateExpression: string,
    ExpressionAttributeValues: Record<string, any>,
    ExpressionAttributeNames: Record<string, string>
} => {
    const currentFailures = (item.failed_attempts || 0) + 1;
    let updateExp = 'SET #fa = :f';
    const expValues: any = { ':f': currentFailures };
    const expNames: any = { '#fa': 'failed_attempts' };

    // 試行限界に達した場合、ロック期限を算出・追加
    if (currentFailures >= config.maxAttempts) {
        const lockUntil = new Date(Date.now() + config.lockDurationSeconds * 1000).toISOString();
        updateExp += ', #lu = :l';
        expValues[':l'] = lockUntil;
        expNames['#lu'] = 'locked_until';
    }

    return {
        UpdateExpression: updateExp,
        ExpressionAttributeValues: expValues,
        ExpressionAttributeNames: expNames
    };
};

/**
 * 試行成功時に、レート制限関連のカウントとロックを解除するための更新パラメータを構築します。
 * 
 * @returns UpdateCommand 用の REMOVE 式。
 */
export const getResetRateLimitUpdate = (): {
    UpdateExpression: string,
    ExpressionAttributeNames: Record<string, string>
} => {
    return {
        UpdateExpression: 'REMOVE #fa, #lu',
        ExpressionAttributeNames: {
            '#fa': 'failed_attempts',
            '#lu': 'locked_until'
        }
    };
};
