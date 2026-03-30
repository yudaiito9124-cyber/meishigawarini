/**
 * 概要: 送り主プロフィール（Sender Info）の管理
 * 詳細: チャット画面に表示される送り主情報の更新、ユーザーテンプレートとしての保存・読み込み、および不要画像の削除を行います。
 * エンドポイント:
 *  - POST /receive/sender/update (現在のチャットの送り主情報を更新)
 *  - POST /receive/sender/load (ユーザーテンプレートから読み込み)
 *  - POST /receive/sender/save (現在の内容をユーザーテンプレートとして保存)
 *  - POST /receive/sender/delete-images (S3画像の削除)
 * リクエストボディ:
 *  - shop_id: 操作対象のショップID (不要だが互換性のために残る場合あり)
 *  [update の場合]
 *  - sender_info: 更新するプロフィール情報オブジェクト (必須)
 *  - deleted_html_image_urls: 削除対象の画像URLリスト (オプション)
 *  [load / save の場合]
 *  - id: ユーザーID (必須)
 *  [delete-images の場合]
 *  - urls: 削除するS3画像URLの配列 (必須)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { stripSignature, deleteFileByUrl, copyS3Object, signUrlIfS3, signUrlsInHtml, stripSignaturesInHtml } from './utils/s3';
import { appendToHistory } from './utils/history';
import { generateId } from './utils/id';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true
    }
});
const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-QR-UUID,X-QR-PIN',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
};

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

        const authorizer = event.requestContext.authorizer;
        const uuid = authorizer?.uuid || (event.headers['X-QR-UUID'] || event.headers['x-qr-uuid']);
        const userId = authorizer?.userId; // Tokenから取得されたユーザーID (任意)
        if (!uuid) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing UUID' }) };

        const body = JSON.parse(event.body || '{}');
        
        // Determine action from path or body
        let action = body.action;
        const resPath = event.resource;
        if (resPath.endsWith('/update')) action = 'update_sender_info';
        else if (resPath.endsWith('/load')) action = 'load_from_id';
        else if (resPath.endsWith('/save')) action = 'save_as_new_user';
        else if (resPath.endsWith('/delete-images')) action = 'delete_images';

        // ====================================================================
        // ACTION: update_sender_info (送り主プロフィール情報の更新)
        // ====================================================================
        if (action === 'update_sender_info') {
            const { sender_info, deleted_html_image_urls, locale } = body;
            if (!sender_info) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing sender_info' }) };

            // 【DB操作: UpdateItem】
            // - 目的: チャット画面に表示される送り主のプロフィール情報(名称, メアド, HTML詳細等)を更新
            // - テーブル: TABLE_NAME (DynamoDB)
            // - キー構成: { PK: `QR#${uuid}`, SK: 'CHAT' }
            // - 更新内容: sender_info 属性全体を更新。S3署名パラメータは除去して保存。
            // - 更新戦略: 部分更新。ReturnValues: 'ALL_OLD' を使用して、更新前に設定されていた画像URLを特定し、S3からの物理削除に利用。
            const res = await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                UpdateExpression: 'SET sender_info = :info',
                ExpressionAttributeValues: {
                    ':info': {
                        ...sender_info,
                        card_image_url: stripSignature(sender_info.card_image_url),
                        html_image_urls: (sender_info.html_image_urls || []).map((url: string) => stripSignature(url)),
                        detail_html: stripSignaturesInHtml(sender_info.detail_html, BUCKET_NAME)
                    }
                },
                ReturnValues: 'ALL_OLD'
            }));

            // メール配信リスト(Mailing List)の同期処理
            const oldEmail = res.Attributes?.sender_info?.email;
            const newEmail = sender_info.email;
            if (oldEmail !== newEmail) {
                if (oldEmail) {
                    // 【DB操作: UpdateItem】
                    // - 目的: 送信者メールアドレス変更に伴い、メーリングリスト(notification_emails)から旧メールアドレスを削除
                    // - テーブル: TABLE_NAME (DynamoDB)
                    // - キー構成: { PK: `QR#${uuid}`, SK: 'CHAT' }
                    // - 更新内容: notification_emails (SS型) から値を削除し、email_preferences (Map型) からキーを削除
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                        UpdateExpression: 'DELETE notification_emails :old_email REMOVE email_preferences.#em',
                        ExpressionAttributeNames: { '#em': oldEmail },
                        ExpressionAttributeValues: { ':old_email': new Set([oldEmail]) }
                    })).catch(e => console.error("Sync failed (remove old email):", e));
                }
                if (newEmail) {
                    // 【DB操作: UpdateItem】
                    // - 目的: メーリングリスト(notification_emails)に新メールアドレスを追加
                    // - テーブル: TABLE_NAME (DynamoDB)
                    // - キー構成: { PK: `QR#${uuid}`, SK: 'CHAT' }
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                        UpdateExpression: 'ADD notification_emails :new_email SET email_preferences = if_not_exists(email_preferences, :empty_map)',
                        ExpressionAttributeValues: { ':new_email': new Set([newEmail]), ':empty_map': {} }
                    })).catch(e => console.error("Sync failed (add new email):", e));
                    
                    const lang = locale === 'ja' ? 'ja' : 'en';
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                        UpdateExpression: 'SET email_preferences.#em = :lang',
                        ExpressionAttributeNames: { '#em': newEmail },
                        ExpressionAttributeValues: { ':lang': lang }
                    })).catch(e => console.error("Sync failed (set preference):", e));
                }
            }

            // 不要になったS3画像の物理削除
            const oldImageUrl = res.Attributes?.sender_info?.card_image_url;
            const newImageUrl = stripSignature(sender_info.card_image_url);
            if (oldImageUrl && oldImageUrl !== newImageUrl) await deleteFileByUrl(oldImageUrl, BUCKET_NAME);

            const oldHtmlUrls = res.Attributes?.sender_info?.html_image_urls || [];
            const newHtmlUrls = (sender_info.html_image_urls || []).map((url: string) => stripSignature(url));
            const toDelete = oldHtmlUrls.filter((url: string) => !newHtmlUrls.includes(url));
            for (const url of toDelete) await deleteFileByUrl(url, BUCKET_NAME);

            if (deleted_html_image_urls && Array.isArray(deleted_html_image_urls)) {
                for (const url of deleted_html_image_urls) {
                    const cleanUrl = stripSignature(url);
                    if (cleanUrl && !toDelete.includes(cleanUrl)) await deleteFileByUrl(cleanUrl, BUCKET_NAME);
                }
            }

            // ログイン済みの場合は送信履歴(SENDLOG)として記録し、CHATメタデータの送信者IDも更新する
            if (userId) {
                try {
                    // 【DB操作: UpdateItem】
                    // - 目的: チャットレコード(CHAT)に送信者(送り主)のユーザーIDを紐づける
                    // - テーブル: TABLE_NAME (DynamoDB)
                    // - キー構成: { PK: `QR#${uuid}`, SK: 'CHAT' }
                    // - 更新内容: sender_id に現在のログインユーザーIDをセットし、更新日時を記録
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                        UpdateExpression: 'SET sender_id = :sid, ts_updated_at = :now',
                        ExpressionAttributeValues: { ':sid': userId, ':now': new Date().toISOString() }
                    }));
                    await appendToHistory(ddb, TABLE_NAME, userId, 'SENDLOG', uuid);
                } catch (e) {
                    console.error('History logging failed', e);
                }
            }

            // 更新後の情報を署名付きで返す
            const signedSenderInfo = { ...sender_info };
            if (signedSenderInfo.card_image_url) signedSenderInfo.card_image_url = await signUrlIfS3(signedSenderInfo.card_image_url, BUCKET_NAME);
            if (signedSenderInfo.detail_html) signedSenderInfo.detail_html = await signUrlsInHtml(signedSenderInfo.detail_html, BUCKET_NAME);
            if (signedSenderInfo.html_image_urls && Array.isArray(signedSenderInfo.html_image_urls)) {
                signedSenderInfo.html_image_urls = await Promise.all(signedSenderInfo.html_image_urls.map((url: string) => signUrlIfS3(url, BUCKET_NAME)));
            }

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Sender info updated', data: signedSenderInfo }) };
        }

        // ====================================================================
        // ACTION: save_as_new_user (入力情報をテンプレートとして新規ユーザー保存)
        // ====================================================================
        if (action === 'save_as_new_user') {
            const { sender_info, id } = body;
            if (!sender_info) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing sender_info' }) };
            
            const userid = id ? id.replace('USER#', '').trim() : generateId();

            // S3ファイルをユーザー別の永続ディレクトリへコピー
            const copyFile = async (url: string) => {
                if (!url || !url.includes(BUCKET_NAME)) return url;
                try {
                    const urlObj = new URL(url);
                    let sourceKey = decodeURIComponent(urlObj.pathname.substring(1));
                    if (sourceKey.startsWith(`${BUCKET_NAME}/`)) sourceKey = sourceKey.substring(BUCKET_NAME.length + 1);
                    const filename = sourceKey.split('/').pop();
                    const destKey = `user/${userid}/usercontent/${filename}`;
                    await copyS3Object(BUCKET_NAME, sourceKey, destKey);
                    const region = process.env.AWS_REGION || 'ap-northeast-1';
                    return `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${destKey}`;
                } catch (e) {
                    console.error("S3 Copy failed:", url, e);
                    return url;
                }
            };

            let senderInfoStr = JSON.stringify(sender_info);
            const urlRegex = /https?:\/\/[^"'\s\\]+/g;
            const matches = senderInfoStr.match(urlRegex) || [];
            const uniqueUrls = [...new Set(matches)].filter((url) => url.includes(BUCKET_NAME));
            for (const url of uniqueUrls) {
                const newUrl = await copyFile(url);
                senderInfoStr = senderInfoStr.split(url).join(newUrl);
            }
            const newSenderInfo = JSON.parse(senderInfoStr);
            const restrictedKeys = ['ts_created_at', 'ts_updated_at', 'PK', 'SK', 'sender_id', 'import_id'];
            const keys = Object.keys(newSenderInfo).filter(k => !restrictedKeys.includes(k));

            // 【DB操作: UpdateItem】
            // - 目的: 送り手ユーザー本人としてのプロフィールテンプレートを保存
            // - テーブル: TABLE_NAME (DynamoDB)
            // - キー構成:
            //   - PK: `USER#${userid}` (Cognito ID またはランダム生成ID)
            //   - SK: 'SENDER' (ユーザープロフィールの固定SK)
            // - 更新内容: タイムスタンプ管理、および全プロフィール属性の上書き保存
            // - 更新戦略: Upsert (存在しない場合は新規作成、ある場合は各属性を上書き)
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${userid}`, SK: 'SENDER' },
                UpdateExpression: 'SET #ts_up = :now, #ts_cr = if_not_exists(#ts_cr, :now)' +
                    (keys.length > 0 ? ', ' + keys.map((_, i) => `#field${i} = :val${i}`).join(', ') : ''),
                ExpressionAttributeNames: {
                    '#ts_cr': 'ts_created_at', '#ts_up': 'ts_updated_at',
                    ...keys.reduce((acc, k, i) => ({ ...acc, [`#field${i}`]: k }), {})
                },
                ExpressionAttributeValues: {
                    ':now': new Date().toISOString(),
                    ...keys.reduce((acc, k, i) => ({ ...acc, [`:val${i}`]: newSenderInfo[k] }), {})
                }
            }));

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'User updated successfully', userid }) };
        }

        // ====================================================================
        // ACTION: load_from_id (既存のユーザープロフィールをこのチャットに読み込み)
        // ====================================================================
        if (action === 'load_from_id') {
            let { id } = body;
            if (!id || typeof id !== 'string') return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing or invalid ID' }) };
            
            let trimid = id.startsWith("USER#") ? id.replace("USER#", "") : id;
            const pk = `USER#${trimid}`;

            // 【DB操作: GetItem】
            // - 目的: 指定されたユーザーIDのプロフィールテンプレート情報を取得
            // - テーブル: TABLE_NAME (DynamoDB)
            // - キー構成:
            //   - PK: `USER#${trimid}`
            //   - SK: 'SENDER'
            // - 取得項目: プロフィールの全属性。PK, SK は除外してクライアントへ。
            const getRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: pk, SK: 'SENDER' } }));
            if (!getRes.Item) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ message: 'User data not found' }) };

            const sender_info = { ...getRes.Item };
            delete sender_info.PK; delete sender_info.SK;

            // S3画像に期限付き署名を付与
            if (sender_info.card_image_url) sender_info.card_image_url = await signUrlIfS3(sender_info.card_image_url, BUCKET_NAME);
            if (sender_info.detail_html) sender_info.detail_html = await signUrlsInHtml(sender_info.detail_html, BUCKET_NAME);
            if (sender_info.html_image_urls && Array.isArray(sender_info.html_image_urls)) {
                sender_info.html_image_urls = await Promise.all(sender_info.html_image_urls.map((url: string) => signUrlIfS3(url, BUCKET_NAME)));
            }

            // 【DB操作: UpdateItem】
            // - 目的: このチャット(QR)がどのユーザーテンプレートに紐づいているかの参照ID(sender_id)を更新
            // - テーブル: TABLE_NAME (DynamoDB)
            // - キー構成: { PK: `QR#${uuid}`, SK: 'CHAT' }
            // - 更新内容: sender_id に対象ユーザーIDをセット。これにより次回以降もこのIDが参照される。
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${uuid}`, SK: 'CHAT' },
                UpdateExpression: 'SET sender_id = :id',
                ExpressionAttributeValues: { ':id': trimid }
            }));

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ sender_info }) };
        }

        // ====================================================================
        // ACTION: delete_images (画像の物理削除)
        // ====================================================================
        if (action === 'delete_images') {
            const { urls } = body;
            if (!urls || !Array.isArray(urls)) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Missing urls' }) };

            for (const url of urls) {
                const cleanUrl = stripSignature(url);
                // セキュリティチェック: 適切なバケット内かつ関連するパスのみ許可
                if (cleanUrl && cleanUrl.includes(BUCKET_NAME) && (cleanUrl.includes(`qrcode/${uuid}/`) || cleanUrl.includes(`user/`))) {
                    await deleteFileByUrl(cleanUrl, BUCKET_NAME);
                }
            }
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Images deleted' }) };
        }

        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ message: 'Unknown action' }) };

    } catch (error: any) {
        console.error(error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ message: 'Internal Server Error' }) };
    }
};
