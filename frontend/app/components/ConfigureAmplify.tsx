'use client';

import { Amplify } from 'aws-amplify';

const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

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
    console.warn('Amplify is not configured. Environment variables NEXT_PUBLIC_COGNITO_USER_POOL_ID or NEXT_PUBLIC_COGNITO_CLIENT_ID are missing.');
}

export default function ConfigureAmplify() {
    return null;
}
