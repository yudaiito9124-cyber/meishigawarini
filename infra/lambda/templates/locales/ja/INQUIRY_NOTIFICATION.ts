export const body = `ショップオーナー様 ({{shopName}})

お客様よりお問い合わせがありました。


【ショップ管理画面】
{{baseUrl}}/shop/{{shopId}}

【注文ID(QR)】
{{qr_id}}

【お問い合わせ内容】
{{content}}

【返信用メールアドレス】
{{reply_email}}

【電話番号】
{{phone}}

このメールに直接返信することで、お客様へ連絡することができます。

--
名刺代わりに
{{baseUrl}}
`;
