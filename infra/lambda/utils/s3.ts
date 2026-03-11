import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
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
