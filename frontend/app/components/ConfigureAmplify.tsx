/**
 * ファイル概要: AWS Amplify の初期化設定
 * 目的: クライアントサイドでのCognito User Poolを利用した認証機能をセットアップします。
 */
'use client'; // サーバーサイドで実行されないようにする　すべてのクライアントサイドで実行される

import { Amplify } from 'aws-amplify';

// ログインに使用
const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID;

if (userPoolId && userPoolClientId) {
    Amplify.configure({
        Auth: {
            Cognito: {
                userPoolId: userPoolId,
                userPoolClientId: userPoolClientId,
            }
        }
    });
} else {
    console.warn('Amplify is not configured. Environment variables COGNITO_USER_POOL_ID or COGNITO_CLIENT_ID are missing.');
}

export default function ConfigureAmplify() {
    return null;
}
