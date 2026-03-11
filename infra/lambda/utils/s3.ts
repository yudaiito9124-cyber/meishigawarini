import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({});

/**
 * Generates a presigned URL for GETting an object from S3.
 */
export async function getPresignedViewUrl(bucket: string, key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
    });
    return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Checks if the URL is an S3 URL for our bucket and signs it if it is.
 * Expects format: https://{bucket}.s3.{region}.amazonaws.com/{key}
 */
export async function signUrlIfS3(url: string | undefined, bucketName: string): Promise<string | undefined> {
    if (!url || !url.includes(bucketName) || !url.includes('.s3.')) {
        return url;
    }

    try {
        const urlObj = new URL(url);
        // Path is like /key or /bucket/key depending on calling convention, 
        // but typically https://bucket.s3.region.amazonaws.com/key
        // So pathname starts with / and then the key.
        const key = decodeURIComponent(urlObj.pathname.substring(1));
        
        return await getPresignedViewUrl(bucketName, key);
    } catch (e) {
        console.error("Failed to sign S3 URL:", url, e);
        return url;
    }
}

/**
 * Removes query parameters from a URL to store the clean S3 path.
 */
export function stripSignature(url: string | undefined): string | undefined {
    if (!url) return url;
    try {
        const urlObj = new URL(url);
        urlObj.search = '';
        return urlObj.toString();
    } catch (e) {
        return url;
    }
}
/**
 * Deletes an object from S3.
 */
export async function deleteFileFromS3(bucket: string, key: string): Promise<void> {
    const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
    });
    await s3Client.send(command);
}

/**
 * Deletes an object from S3 using its URL.
 */
export async function deleteFileByUrl(url: string | undefined, bucketName: string): Promise<void> {
    if (!url || !url.includes(bucketName)) return;
    try {
        const urlObj = new URL(url);
        // Path might be /bucket/key or /key. 
        // If it starts with /bucketName/, we strip that too.
        let key = decodeURIComponent(urlObj.pathname.substring(1));
        if (key.startsWith(`${bucketName}/`)) {
            key = key.substring(bucketName.length + 1);
        }
        await deleteFileFromS3(bucketName, key);
        console.log(`Deleted S3 object: ${key}`);
    } catch (e) {
        console.error(`Failed to delete S3 object by URL: ${url}`, e);
    }
}

/**
 * Finds S3 URLs in HTML and replaces them with signed URLs.
 */
export async function signUrlsInHtml(html: string | undefined, bucketName: string): Promise<string | undefined> {
    if (!html) return html;

    // Regex to match our S3 URLs (without query params)
    // Matches: https://{bucket}.s3.{region}.amazonaws.com/{key}
    const s3UrlPattern = new RegExp(`https://${bucketName}\\.s3\\.[a-z0-9-]+\\.amazonaws\\.com/[^"\\s<>]+`, 'g');

    const matches = html.match(s3UrlPattern);
    if (!matches) return html;

    let signedHtml = html;
    // Use a Map to avoid re-signing the same URL multiple times
    const urlMap = new Map<string, string>();

    for (const url of matches) {
        if (!urlMap.has(url)) {
            const signedUrl = await signUrlIfS3(url, bucketName);
            if (signedUrl) {
                urlMap.set(url, signedUrl);
            }
        }
    }

    // Replace all occurrences
    for (const [original, signed] of urlMap.entries()) {
        // Simple string replacement is fine here as we matched exactly
        signedHtml = signedHtml.split(original).join(signed);
    }

    return signedHtml;
}


/**
 * Copies an object from one S3 key to another within the same bucket.
 */
export async function copyS3Object(bucket: string, sourceKey: string, destKey: string): Promise<void> {
    const { CopyObjectCommand } = await import('@aws-sdk/client-s3');
    const command = new CopyObjectCommand({
        Bucket: bucket,
        CopySource: encodeURI(`${bucket}/${sourceKey}`),
        Key: destKey,
    });
    await s3Client.send(command);
}
