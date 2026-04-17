/**
 * @file s3.ts
 * @role S3 ストレージ操作・ URL 管理ユーティリティ
 * @responsibility
 *  - S3 バケット内のファイル操作（取得、削除、コピー、プレフィックス単位の削除）を抽象化します。
 *  - ブラウザ表示用の署名付き URL（Presigned URL）の生成および、HTML 内の S3 パスの一括署名機能を提供します。
 *  - データベース保存用に URL から署名を除去する（クレンジング）正規化ロジックを提供します。
 *  - アップロードされた一時ファイルを正式なディレクトリ構造へ移動（ローカライズ）する機能を提供します。
 * @context
 *  - 画像を含むほぼすべての Lambda 関数で使用される、基盤的なストレージユーティリティです。
 */

import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** 共通の S3 クライアント。実行環境の IAM ロールに基づき認証されます。 */
export const s3Client = new S3Client({});

/**
 * 指定されたオブジェクトに対する期限付き署名付き URL（閲覧用）を生成します。
 * 
 * @param bucket - S3 バケット名。
 * @param key - オブジェクトのキー（パス）。
 * @param expiresIn - URL の有効期限（秒）。デフォルト 1 時間。
 * @returns 署名付き URL 文字列。
 */
export async function getPresignedViewUrl(bucket: string, key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
    });
    return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * 指定された URL が管理対象バケットの S3 URL である場合、署名付き URL に変換します。
 * 
 * @description
 * 以下の形式に対応しています：
 * - `s3://{bucket}/{key}`
 * - `https://{bucket}.s3.{region}.amazonaws.com/{key}`
 * 
 * @param url - 変換対象のパスまたは URL。
 * @param bucketName - 比較対象のバケット名。
 * @returns 署名済み URL。条件に合致しない場合は元の文字列を返します。
 */
export async function signUrlIfS3(url: string | undefined, bucketName: string): Promise<string | undefined> {
    if (!url) return url;
    // バケット名が含まれていない、かつ S3 URL 形式でもない場合はそのまま返す
    if (!url.includes(bucketName) && !url.includes('.s3.') && !url.startsWith('s3://')) return url;

    let key = '';
    let targetBucket = bucketName;

    try {
        if (url.startsWith('s3://')) {
            const temp = url.substring(5);
            targetBucket = temp.split('/')[0];
            key = temp.substring(targetBucket.length + 1);
        } else if (url.includes('.s3.')) {
            const urlObj = new URL(url);
            targetBucket = urlObj.hostname.split('.')[0];
            key = decodeURIComponent(urlObj.pathname.substring(1));
            // パスが /bucket/key のようになっている場合に正規化
            if (key.startsWith(`${targetBucket}/`)) {
                key = key.substring(targetBucket.length + 1);
            }
        } else {
            // URL に bucketName が含まれているが特定の形式ではない場合（旧来の互換性用）
            key = url.split(bucketName).pop() || '';
            if (key.startsWith('/')) key = key.substring(1);
        }

        if (!key) return url;
        return await getPresignedViewUrl(targetBucket, key);
    } catch (e) {
        console.error("Failed to sign S3 URL:", url, e);
        return url;
    }
}

/**
 * URL からクエリパラメータ（署名、認証情報、有効期限等）を除去し、正規の S3 永続化パスのみを抽出します。
 * 
 * @description
 * データベースには「表示時点での署名」を保存せず、この関数でクレンジングされたパスを保存することで、
 * 署名切れによるリンク切れエラーを物理的に防ぎます。
 * 
 * @param url - クレンジング対象の URL。
 * @returns パラメータが除去されたクリーンな URL 文字列。
 */
export function stripSignature(url: string | undefined): string | undefined {
    if (!url) return url;
    if (url.startsWith('s3://')) return url; 
    try {
        const urlObj = new URL(url);
        urlObj.search = '';
        return urlObj.toString();
    } catch (e) {
        return url;
    }
}

/**
 * 標準的な HTTPS 形式の S3 公開 URL（未署名）を構築します。
 * 
 * @param bucket - バケット名。
 * @param key - オブジェクトキー。
 * @returns 公開 URL 文字列。
 */
export function getPublicUrl(bucket: string, key: string): string {
    const region = process.env.AWS_REGION || 'ap-northeast-1';
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

/**
 * S3 から単一のオブジェクトを削除します。
 */
export async function deleteFileFromS3(bucket: string, key: string): Promise<void> {
    const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
    });
    await s3Client.send(command);
}

/**
 * URL（署名付き含む）からオブジェクトのキーを特定し、S3 から削除します。
 */
export async function deleteFileByUrl(url: string | undefined, bucketName: string): Promise<void> {
    if (!url || !url.includes(bucketName)) return;
    try {
        const urlObj = new URL(url);
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
 * HTML 文字列内を検索し、含まれる全ての S3 URL を署名付き URL に一括置換します。
 * 
 * @description
 * 送り主情報（SENDER）の詳細説明用 HTML 等に含まれる画像を、ブラウザで安全に表示できるようにします。
 * 
 * @param html - 置換対象の HTML 文字列。
 * @param bucketName - 検索対象のバケット名。
 * @returns 置換済みの HTML 文字列。
 */
export async function signUrlsInHtml(html: string | undefined, bucketName: string): Promise<string | undefined> {
    if (!html) return html;

    const s3UrlPattern = /https?:\/\/[a-z0-9.-]+(?:\.s3[.-][a-z0-9-]+)?\.amazonaws\.com\/[^"\s<>]+/g;
    const matches = html.match(s3UrlPattern);
    if (!matches) return html;

    let signedHtml = html;
    const urlMap = new Map<string, string>();

    for (const url of matches) {
        if (!urlMap.has(url)) {
            const signedUrl = await signUrlIfS3(url, bucketName);
            if (signedUrl) {
                urlMap.set(url, signedUrl);
            }
        }
    }

    for (const [original, signed] of urlMap.entries()) {
        signedHtml = signedHtml.split(original).join(signed);
    }

    return signedHtml;
}

/**
 * 同一バケット内でオブジェクトをコピーします。
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
 * HTML 文字列内を検索し、含まれる全ての S3 URL から署名（クエリパラメータ）を一括除去します。
 */
export function stripSignaturesInHtml(html: string | undefined, bucketName: string): string | undefined {
    if (!html) return html;

    const s3UrlPattern = /https?:\/\/[a-z0-9.-]+(?:\.s3[.-][a-z0-9-]+)?\.amazonaws\.com\/[^"\s<>]+/g;

    return html.replace(s3UrlPattern, (match) => {
        return stripSignature(match) || match;
    });
}

/**
 * 指定されたプレフィックス配下の全てのオブジェクトを削除（フォルダ削除）します。
 */
export async function deleteFolderFromS3(bucket: string, prefix: string): Promise<void> {
    const { ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
    
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
 * 外部からアップロードされた一時画像などを、特定のデザインディレクトリ（admin/card-designs/など）へ
 * 名前を正規化して移動・永続化します。
 * 
 * @description
 * - /temp/ 配下などにある不安定なパスから、管理構造に基づいた安定したパスへ変更します。
 * - front, back, thumbf, thumbb 等の役割に応じたファイル名（bgimgf.png等）を付与します。
 * 
 * @param url - 移動元の URL。
 * @param bucket - 操作対象バケット名。
 * @param designId - 移動先のディレクトリ名となるデザイン ID。
 * @param type - 画像の役割区分。
 * @returns 移動後の新しいクリーンな URL。
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

        // すでに移動先のパスであればクレンジングのみして完了
        if (sourceKey === targetKey) {
            return stripSignature(url);
        }

        // コピー後に元ファイルを削除（移動をエミュレート）
        await copyS3Object(bucket, sourceKey, targetKey);
        await deleteFileFromS3(bucket, sourceKey);

        const region = urlObj.hostname.split('.')[2] || 'ap-northeast-1';
        return `https://${bucket}.s3.${region}.amazonaws.com/${targetKey}`;

    } catch (e) {
        console.error("Failed to localize S3 image:", url, e);
        return url;
    }
}
