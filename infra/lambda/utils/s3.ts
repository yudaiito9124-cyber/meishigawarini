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

/**
 * Finds S3 URLs in HTML and removes their query parameters (signatures).
 */
export function stripSignaturesInHtml(html: string | undefined, bucketName: string): string | undefined {
    if (!html) return html;

    // Regex to match our S3 URLs
    const s3UrlPattern = new RegExp(`https://${bucketName}\\.s3\\.[a-z0-9-]+\\.amazonaws\\.com/[^"\\s<>]+`, 'g');

    return html.replace(s3UrlPattern, (match) => {
        return stripSignature(match) || match;
    });
}

/**
 * Deletes all objects under a prefix (folder) in S3.
 */
export async function deleteFolderFromS3(bucket: string, prefix: string): Promise<void> {
    const { ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
    
    // Ensure prefix ends with /
    const folderPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    
    let isTruncated = true;
    let continuationToken: string | undefined;

    while (isTruncated) {
        const listCommand: any = new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: folderPrefix,
            ContinuationToken: continuationToken
        });
        
        const listResponse = (await s3Client.send(listCommand)) as any;
        if (!listResponse.Contents || listResponse.Contents.length === 0) break;

        const deleteParams = {
            Bucket: bucket,
            Delete: {
                Objects: listResponse.Contents.map((content: any) => ({ Key: content.Key! }))
            }
        };

        const deleteCommand = new DeleteObjectsCommand(deleteParams);
        await s3Client.send(deleteCommand);

        isTruncated = listResponse.IsTruncated || false;
        continuationToken = listResponse.NextContinuationToken;
    }
}

/**
 * Ensures an S3 image is in the permanent design folder with a standardized name.
 * If it's in /temp/ or has a different name, it moves it.
 */
export async function localizeS3Image(url: string | undefined, bucket: string, designId: string, type: 'front' | 'back' | 'thumbf' | 'thumbb'): Promise<string | undefined> {
    if (!url || !url.includes(bucket) || !url.includes('.s3.')) {
        return url;
    }

    try {
        const urlObj = new URL(url);
        const sourceKey = decodeURIComponent(urlObj.pathname.substring(1));
        const extension = sourceKey.split('.').pop() || 'png';
        
        let targetFilename = '';
        if (type === 'front') targetFilename = `bgimgf.${extension}`;
        else if (type === 'back') targetFilename = `bgimgb.${extension}`;
        else if (type === 'thumbf') targetFilename = `thumbf.${extension}`;
        else if (type === 'thumbb') targetFilename = `thumbb.${extension}`;

        const targetKey = `admin/card-designs/${designId}/${targetFilename}`;

        // If already in target path, do nothing
        if (sourceKey === targetKey) {
            return stripSignature(url);
        }

        // Copy and Delete old
        await copyS3Object(bucket, sourceKey, targetKey);
        await deleteFileFromS3(bucket, sourceKey);

        const region = urlObj.hostname.split('.')[2] || 'ap-northeast-1';
        return `https://${bucket}.s3.${region}.amazonaws.com/${targetKey}`;

    } catch (e) {
        console.error("Failed to localize S3 image:", url, e);
        return url;
    }
}
