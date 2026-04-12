/**
 * @fileoverview AWS Amplify (JavaScript Library / SDK) の初期化設定
 * 
 * ■ 目的
 * クライアントサイドにおいて、Amazon Cognito User Pool を利用した認証機能
 * （ログイン、サインアップ、セッション管理など）が動作するように、SDKの設定を適用します。
 * 
 * ■ 注意点
 * 本プロジェクトにおいて「Amplify」は以下の2つの意味を持ちますが、このファイルは「1」の設定を担います。
 * 1. Amplify JavaScript Library (SDK): フロントエンドからAWSリソース（Cognito等）を呼び出すための道具。
 * 2. Amplify Hosting: フロントエンドのデプロイ・ホスティングを行うサービス（CI/CD等）。
 * 
 * このコンポーネントは、ブラウザでの実行時のみ設定を適用するため、'use client' ディレクティブを使用して
 * クライアントコンポーネントとして定義されています。
 */
'use client';

import { Amplify } from 'aws-amplify';

// 環境変数は Next.js の仕様に基づき、NEXT_PUBLIC_ 接頭辞が付いたものをクライアント側に公開しています。
const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID;
const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;

if (userPoolId && userPoolClientId) {
    console.log('[Amplify] Configuring with UserPoolId:', userPoolId);
    /**
     * リダイレクトURLの動的決定
     * 開発環境（localhost）やステージング環境など、実行環境のドメインを取得して
     * Cognito Hosted UI からのリダイレクト先を決定します。
     */
    const origin = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
    console.log('[Amplify] Dynamic Origin:', origin);
    
    const signInOrigins = [
        `${origin}/login/`,
        `${origin}/ja/login/`,
        `${origin}/en/login/`
    ];
    const signOutOrigins = [
        `${origin}/`,
        `${origin}/ja/`,
        `${origin}/en/`
    ];

    // Amplify SDK の設定。一度呼び出すと、アプリケーション全体で Auth モジュール等が利用可能になります。
    try {
        Amplify.configure({
            Auth: {
                Cognito: {
                    userPoolId: userPoolId,
                    userPoolClientId: userPoolClientId,
                    loginWith: {
                        oauth: {
                            domain: cognitoDomain || '',
                            scopes: ['email', 'openid', 'profile', 'aws.cognito.signin.user.admin'],
                            redirectSignIn: signInOrigins,
                            redirectSignOut: signOutOrigins,
                            responseType: 'code',
                        }
                    }
                }
            }
        });
        console.log('[Amplify] Configuration successful');
    } catch (error) {
        console.error('[Amplify] Configuration failed:', error);
    }
} else {
    // 必須の環境変数が不足している場合は警告を表示します。
    console.warn('[Amplify] Configuration skipped. Missing:', {
        userPoolId: !!userPoolId,
        userPoolClientId: !!userPoolClientId
    });
}

/**
 * ConfigureAmplify コンポーネント
 * 
 * 画面上のUIは持ちませんが、RootLayout 内に配置されることで、
 * アプリケーションのロード時に確実に初期化処理を実行させる役割を果たします。
 */
export default function ConfigureAmplify() {
    return null;
}
