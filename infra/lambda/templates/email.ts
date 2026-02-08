
export const createMessageNotificationEmail = (params: {
    username: string;
    message: string;
    uuid: string;
    pin: string;
    lang?: 'ja' | 'en';
}) => {
    const { username, message, uuid, pin, lang = 'ja' } = params;
    // Use provided URL, or env, or fallback
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;

    let systemmessage = message;
    if (username === 'System') {
        if (lang === "ja") {
            systemmessage = message.replace('DeliveryCompleted', 'ギフトの受け取りが完了しました。');
        }
        else {
            systemmessage = message.replace('DeliveryCompleted', 'Delivery Completed.');
        }
    }

    let subject = '';
    let bodyText = '';

    if (lang === 'en') {
        subject = (username === 'System') ? '【Meishigawarini】System Notification' : `【Meishigawarini】New Message`;
        bodyText = (username === 'System') ? `
${systemmessage}
----------------------------------
Check here:
${baseUrl}/receive/${uuid}
PIN: ${pin}
`.trim()
            :
            `
You have a new message from ${username}.
----------------------------------
${message}
----------------------------------

Check here:
${baseUrl}/receive/${uuid}
PIN: ${pin}
`.trim();
    } else {
        subject = (username === 'System') ? '【名刺がわりに】システム通知' : `【名刺がわりに】新着メッセージ`;
        bodyText = (username === 'System') ? `
${systemmessage}
----------------------------------
確認はこちら:
${baseUrl}/receive/${uuid}
PIN: ${pin}
`.trim()
            :
            `
${username} さんからメッセージが届きました。
----------------------------------
${message}
----------------------------------

確認はこちら:
${baseUrl}/receive/${uuid}
PIN: ${pin}
`.trim();
    }

    return { subject, bodyText };
};

export const createShippingNotificationEmail = (params: {
    uuid: string;
    pin: string;
    lang?: 'ja' | 'en';
}) => {
    const { uuid, pin, lang = 'ja' } = params;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;

    let subject = '';
    let bodyText = '';

    if (lang === 'en') {
        subject = '【Meishigawarini】Shipping Notification';
        bodyText = `
Your item has been shipped.
Please wait for it to arrive.

Check status here:
${baseUrl}/receive/${uuid}
PIN: ${pin}
`.trim();
    } else {
        subject = '【名刺がわりに】発送完了のお知らせ';
        bodyText = `
商品の発送が完了しました。
到着まで今しばらくお待ちください。

確認はこちら:
${baseUrl}/receive/${uuid}
PIN: ${pin}
`.trim();
    }

    return { subject, bodyText };
};
