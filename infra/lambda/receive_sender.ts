/**
 * 概要: 送り主プロフィール（Sender Info）の管理
 * 詳細:
 *  - ギフトを受け取ったチャット画面に表示される送り主情報の更新、ユーザーテンプレートとしての保存・読み込みを行います。
 *  - 送り主情報は、チャットレコード(QR#CHAT)にアタッチされ、受取人へのメッセージの一部となります。
 *
 * エンドポイント:
 *  - POST /receive/sender/update (チャットレコードの送り主情報を直接更新)
 *  - POST /receive/sender/save (現在の内容をユーザーの「固定テンプレート」として保存)
 *  - POST /receive/sender/load (ユーザーの「固定テンプレート」から現在のチャットへコピー)
 *  - POST /receive/sender/delete-images (アセットの物理削除)
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { stripSignature, deleteFileByUrl, copyS3Object, signUrlIfS3, signUrlsInHtml, stripSignaturesInHtml, getPublicUrl } from './utils/s3';
import { generateId } from './utils/id';
import { successResponse, errorResponse } from './utils/response';
import { ddb, TABLE_NAME, BUCKET_NAME } from './share/db';
import { getQrId, getAction, getUserId } from './utils/request';
import { ReceiveApiSchema } from '@shared/api-types';

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') return successResponse();

        const body = JSON.parse(event.body || '{}');
        const userId = getUserId(event);
        const qr_id = getQrId(event, body);
        let action = getAction(event, body);

        // リソースパスに基づくアクションの自動補完 (パスベースのルーティング互換性)
        const resPath = event.resource;
        if (resPath.endsWith('/update')) action = 'update_sender_info';
        else if (resPath.endsWith('/load')) action = 'load_from_id';
        else if (resPath.endsWith('/save')) action = 'save_as_new_user';
        else if (resPath.endsWith('/delete-images')) action = 'delete-images';

        if (!qr_id) return errorResponse(400, 'Missing QR ID');

        // ====================================================================
        // ACTION: update_sender_info (チャット送り主情報の更新)
        // --------------------------------------------------------------------
        // 目的: 指定されたギフト(qr_id)のチャット画面に表示するプロフィールを更新します。
        // ====================================================================
        if (action === 'update_sender_info') {
            const { sender_info, deleted_html_image_urls } = body as ReceiveApiSchema['receive_sender_update'];
            if (!sender_info) return errorResponse(400, 'Missing sender_info');

            // 【ステータスチェック】送り主情報を登録できるのはActiveの状態のみ
            const metaRes = await ddb.send(new GetCommand({
                TableName: TABLE_NAME, Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
            }));
            if (!metaRes.Item || metaRes.Item.status !== 'ACTIVE') {
                return errorResponse(403, 'Sender info can only be updated for active gifts.');
            }

            const res = await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
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

            // メーリングリスト（通知先メールアドレス）の管理
            const oldEmail = res.Attributes?.sender_info?.email;
            const newEmail = sender_info.email;

            if (oldEmail !== newEmail) {
                if (oldEmail) {
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
                        UpdateExpression: 'DELETE notification_emails :old_email REMOVE email_preferences.#em',
                        ExpressionAttributeNames: { '#em': oldEmail },
                        ExpressionAttributeValues: { ':old_email': new Set([oldEmail]) }
                    })).catch(e => console.warn('Failed to remove old sender email from mailing list:', e));
                }
                if (newEmail) {
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
                        UpdateExpression: 'ADD notification_emails :new_email',
                        ExpressionAttributeValues: { ':new_email': new Set([newEmail]) }
                    })).catch(e => console.warn('Failed to add new sender email to mailing list:', e));
                }
            }

            // アセット物理削除
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

            return successResponse({ message: 'Sender info updated successfully' });
        }

        // ====================================================================
        // ACTION: save_as_new_user (ユーザー固定テンプレートとしての保存)
        // --------------------------------------------------------------------
        // 目的: 入力情報をユーザーの「送り主テンプレート」(USER#SENDER)として保存します。
        // ====================================================================
        if (action === 'save_as_new_user') {
            const { sender_info, id } = body as ReceiveApiSchema['receive_sender_save'];
            if (!sender_info) return errorResponse(400, 'Missing sender_info');

            const userid = id ? id.replace('USER#', '').trim() : generateId();

            const copyFile = async (url: string) => {
                if (!url || !url.includes(BUCKET_NAME)) return url;
                try {
                    const urlObj = new URL(url);
                    let sourceKey = decodeURIComponent(urlObj.pathname.substring(1));
                    if (sourceKey.startsWith(`${BUCKET_NAME}/`)) sourceKey = sourceKey.substring(BUCKET_NAME.length + 1);
                    const filename = sourceKey.split('/').pop();
                    const destKey = `user/${userid}/usercontent/${filename}`;
                    await copyS3Object(BUCKET_NAME, sourceKey, destKey);
                    return getPublicUrl(BUCKET_NAME, destKey);
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

            return successResponse({ message: 'User updated successfully', userid });
        }

        // ====================================================================
        // ACTION: load_from_id (テンプレートの読み込み)
        // --------------------------------------------------------------------
        // 目的: ユーザーのテンプレートを現在のチャット(CHAT)へコピーします。
        // ====================================================================
        if (action === 'load_from_id') {
            const { id } = body as ReceiveApiSchema['receive_sender_load'];
            if (!id || typeof id !== 'string') return errorResponse(400, 'Missing or invalid ID');

            let trimid = id.startsWith("USER#") ? id.replace("USER#", "") : id;
            const pk = `USER#${trimid}`;

            const getRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: pk, SK: 'SENDER' } }));
            if (!getRes.Item) return errorResponse(404, 'User data not found');

            const sender_info = { ...getRes.Item };
            delete sender_info.PK; delete sender_info.SK;

            if (sender_info.card_image_url) sender_info.card_image_url = await signUrlIfS3(sender_info.card_image_url, BUCKET_NAME);
            if (sender_info.detail_html) sender_info.detail_html = await signUrlsInHtml(sender_info.detail_html, BUCKET_NAME);
            if (sender_info.html_image_urls && Array.isArray(sender_info.html_image_urls)) {
                sender_info.html_image_urls = await Promise.all(sender_info.html_image_urls.map((url: string) => signUrlIfS3(url, BUCKET_NAME)));
            }

            // チャットレコードへの参照IDセット
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `QR#${qr_id}`, SK: 'CHAT' },
                UpdateExpression: 'SET sender_id = :id',
                ExpressionAttributeValues: { ':id': trimid }
            }));

            return successResponse({ sender_info });
        }

        // ====================================================================
        // ACTION: delete-images (画像物理削除)
        // ====================================================================
        if (action === 'delete-images') {
            const { urls } = body as ReceiveApiSchema['receive_sender_delete_images'];
            if (!urls || !Array.isArray(urls)) return errorResponse(400, 'Missing urls');
            for (const url of urls) {
                const cleanUrl = stripSignature(url);
                if (cleanUrl && cleanUrl.includes(BUCKET_NAME) && (cleanUrl.includes(`qrcode/${qr_id}/`) || cleanUrl.includes(`user/`))) {
                    await deleteFileByUrl(cleanUrl, BUCKET_NAME);
                }
            }
            return successResponse({ message: 'Images deleted' });
        }

        return errorResponse(400, 'Unknown action');

    } catch (error: any) {
        console.error('Receive sender error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
