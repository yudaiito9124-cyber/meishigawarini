
import { UpdateCommandInput } from '@aws-sdk/lib-dynamodb';

export interface RateLimitConfig {
    maxAttempts: number;
    lockDurationSeconds: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
    maxAttempts: 5,
    lockDurationSeconds: 1800 // 30 minutes
};

export const isLocked = (item: any): boolean => {
    if (!item) return false;

    // Check if currently locked
    if (item.locked_until) {
        const now = new Date();
        const lockedUntil = new Date(item.locked_until);
        if (now < lockedUntil) {
            return true;
        }
    }
    return false;
};

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

    // If we just hit the limit, set the lock
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
