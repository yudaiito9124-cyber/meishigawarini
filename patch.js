const fs = require('fs');

const path1 = 'c:\\git\\meishigawarini\\infra\\lambda\\recipient-chat.ts';
let content1 = fs.readFileSync(path1, 'utf8');

const find1 = `                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'Sender info updated', data: sender_info })
                };
            }`;

const replace1 = find1 + `

            // === HANDLE SAVE AS NEW USER ===
            if (type === 'save_as_new_user') {
                const { sender_info } = body;
                if (!sender_info) {
                    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing sender_info' }) };
                }

                const now = new Date();
                const timestamp = now.toISOString().replace(/[:T]/g, '-').split('.')[0].replace(/-/g, '').slice(0, 8) + '-' + now.toISOString().split('T')[1].split('.')[0].replace(/:/g, '');
                const randomUuid = crypto.randomUUID();
                const userid = \`\${timestamp}-\${randomUuid}\`;

                const newSenderInfo = { ...sender_info };

                const copyFile = async (url) => {
                    if (!url || !url.includes(BUCKET_NAME)) return url;
                    try {
                        const urlObj = new URL(url);
                        let sourceKey = decodeURIComponent(urlObj.pathname.substring(1));
                        if (sourceKey.startsWith(\`\${BUCKET_NAME}/\`)) {
                            sourceKey = sourceKey.substring(BUCKET_NAME.length + 1);
                        }
                        const filename = sourceKey.split('/').pop();
                        const destKey = \`user/\${userid}/usercontent/\${filename}\`;
                        await copyS3Object(BUCKET_NAME, sourceKey, destKey);
                        
                        const region = process.env.AWS_REGION || 'ap-northeast-1';
                        return \`https://\${BUCKET_NAME}.s3.\${region}.amazonaws.com/\${destKey}\`;
                    } catch (e) {
                        console.error("Failed to copy S3 object:", url, e);
                        return url;
                    }
                };

                if (newSenderInfo.card_image_url) {
                    newSenderInfo.card_image_url = await copyFile(newSenderInfo.card_image_url);
                }

                if (newSenderInfo.html_image_urls && Array.isArray(newSenderInfo.html_image_urls)) {
                    newSenderInfo.html_image_urls = await Promise.all(
                        newSenderInfo.html_image_urls.map((url) => copyFile(url))
                    );
                }

                const keys = Object.keys(newSenderInfo);
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: \`USER#\${userid}\`, SK: 'SENDING' },
                    UpdateExpression: 'SET ' + ['#ts = :ts', ...keys.map((_, i) => \`#field\${i} = :val\${i}\`)].join(', '),
                    ExpressionAttributeNames: {
                        '#ts': 'ts_created_at',
                        ...keys.reduce((acc, k, i) => ({ ...acc, [\`#field\${i}\`]: k }), {})
                    },
                    ExpressionAttributeValues: {
                        ':ts': new Date().toISOString(),
                        ...keys.reduce((acc, k, i) => ({ ...acc, [\`:val\${i}\`]: newSenderInfo[k] }), {})
                    }
                }));

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'User created successfully', userid })
                };
            }`;

content1 = content1.replace(find1.replace(/\n/g, '\r\n'), replace1.replace(/\n/g, '\r\n'));
content1 = content1.replace(find1, replace1);

fs.writeFileSync(path1, content1, 'utf8');

const path2 = 'c:\\git\\meishigawarini\\frontend\\app\\[locale]\\receive\\[uuid]\\page.tsx';
let content2 = fs.readFileSync(path2, 'utf8');

const find2_1 = `        } finally {
            setSenderInfoLoading(false);
        }
    };`;

const replace2_1 = find2_1 + `

    const handleSaveAsNewUser = async () => {
        setSenderInfoLoading(true);
        try {
            const res = await fetch(\`\${NEXT_PUBLIC_API_URL}/recipient/qrcodes/\${uuid}/chat\`, {
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: 'save_as_new_user', pin, sender_info: senderForm })
            });
            if (!res.ok) throw new Error("Failed to save data");
            const data = await res.json();
            alert(\`Saved as new user: \${data.userid}\`);
        } catch (e) {
            alert(t('senderInfo.updateFailed') + e.message);
        } finally {
            setSenderInfoLoading(false);
        }
    };`;

content2 = content2.replace(find2_1.replace(/\n/g, '\r\n'), replace2_1.replace(/\n/g, '\r\n'));
content2 = content2.replace(find2_1, replace2_1);

const find2_2 = `                                            <Button
                                                onClick={() => handleSenderInfoUpdate()}`;

const replace2_2 = `                                            <Button
                                                onClick={() => handleSaveAsNewUser()}
                                                disabled={senderInfoLoading}
                                                variant="outline"
                                                className="w-full border-blue-200 text-blue-600 hover:bg-blue-50"
                                            >
                                                {senderInfoLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                                {senderInfoLoading ? t('senderInfo.saving') : t('senderInfo.saveData')}
                                            </Button>
` + find2_2;

content2 = content2.replace(find2_2.replace(/\n/g, '\r\n'), replace2_2.replace(/\n/g, '\r\n'));
content2 = content2.replace(find2_2, replace2_2);

if (!content2.includes('Save,') && !content2.includes('Save ')) {
    content2 = content2.replace('SendHorizontal,', 'Save, SendHorizontal,');
}

fs.writeFileSync(path2, content2, 'utf8');

console.log("Patch applied successfully.");
