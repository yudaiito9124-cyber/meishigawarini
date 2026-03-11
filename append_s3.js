const fs = require('fs');
const path = 'c:\\git\\meishigawarini\\infra\\lambda\\utils\\s3.ts';
let content = fs.readFileSync(path, 'utf8');
content += `

/**
 * Copies an object from one S3 key to another within the same bucket.
 */
export async function copyS3Object(bucket: string, sourceKey: string, destKey: string): Promise<void> {
    const { CopyObjectCommand } = await import('@aws-sdk/client-s3');
    const command = new CopyObjectCommand({
        Bucket: bucket,
        CopySource: encodeURI(\`\${bucket}/\${sourceKey}\`),
        Key: destKey,
    });
    await s3Client.send(command);
}
`;
fs.writeFileSync(path, content, 'utf8');
console.log('Appended copyS3Object');
