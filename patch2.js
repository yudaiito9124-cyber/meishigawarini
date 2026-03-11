const fs = require('fs');
const path = 'c:\\git\\meishigawarini\\infra\\lambda\\recipient-chat.ts';
let content = fs.readFileSync(path, 'utf8');

const find = `                const newSenderInfo = { ...sender_info };

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
                }`;

const replace = `                const copyFile = async (url: string) => {
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

                let senderInfoStr = JSON.stringify(sender_info);
                const urlRegex = /https?:\\/\\/[^"'\\s\\\\]+/g;
                const matches = senderInfoStr.match(urlRegex) || [];
                const uniqueUrls = [...new Set(matches)].filter((url) => url.includes(BUCKET_NAME));

                const urlMap = new Map<string, string>();
                for (const url of uniqueUrls) {
                    const newUrl = await copyFile(url);
                    urlMap.set(url, newUrl);
                }

                for (const [oldUrl, newUrl] of urlMap.entries()) {
                    senderInfoStr = senderInfoStr.split(oldUrl).join(newUrl);
                }

                const newSenderInfo = JSON.parse(senderInfoStr);`;

content = content.replace(find.replace(/\n/g, '\r\n'), replace.replace(/\n/g, '\r\n'));
content = content.replace(find, replace);

fs.writeFileSync(path, content, 'utf8');
console.log('Update successful');
