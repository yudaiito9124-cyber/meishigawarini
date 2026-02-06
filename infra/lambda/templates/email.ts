
export const createMessageNotificationEmail = (params: {
    username: string;
    message: string;
    uuid: string;
    pin: string;
}) => {
    const { username, message, uuid, pin } = params;
    // Use provided URL, or env, or fallback
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;

    const subject = `【名刺がわりに】新着メッセージ (New Message)`;

    // Keep the indentation and format clean
    const bodyText = `
${username} さんからメッセージが届きました。
You have a new message from ${username}.

${message}

確認はこちら:
Check here:
${baseUrl}/receive/${uuid}
PIN: ${pin}
`.trim();

    return { subject, bodyText };
};
