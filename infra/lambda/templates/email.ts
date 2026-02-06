
export const createMessageNotificationEmail = (params: {
    username: string;
    message: string;
    uuid: string;
    pin: string;
}) => {
    const { username, message, uuid, pin } = params;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;

    const subject = `【名刺がわりに】新着メッセージ (New Message)`;

    // Keep the indentation and format clean
    const bodyText = `
${username} さんからメッセージが届きました。
From ${username}:

${message}

確認はこちら:
Check here:
${baseUrl}/receive/${uuid}
PIN: ${pin}
`.trim();

    return { subject, bodyText };
};
