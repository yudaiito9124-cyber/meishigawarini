/**
 * @file admin_shop_create.ts
 * @description 
 * 管理者（Administrators）権限による新規ショップ作成を行う Lambda ハンドラーです。
 * 
 * 本ファイルは「システム開発の鉄則」に基づき、DB操作の背景・意図を詳解し、
 * ショップ・オーナー・GM（ゼネラルマネージャー）の権限関係を整合性を保って初期化することを保証します。
 * 
 * @responsibility
 * 1. ショップメタデータ（PK=SHOP#{id}, SK=METADATA）の生成と初期設定。
 * 2. オーナー権限（PK=USER#{id}, SK=SHOP）の付与と所属ショップリストの更新。
 * 3. 必要に応じた Cognito からのメールアドレス取得（フォールバック）。
 * 4. 指定された GM ユーザー群への管理権限一括付与（アトミックな更新）。
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { PutCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { generateId } from './utils/id';
import { successResponse, errorResponse, apiResponse } from './utils/response';
import { ddb, TABLE_NAME } from './share/db';
import { AdminApiSchema } from '@shared/api-types';

/**
 * 外部サービス（Cognito）クライアントの初期化
 */
const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID;

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // CORS プリフライト対応
        if (event.httpMethod === 'OPTIONS') return successResponse();
        if (event.httpMethod !== 'POST') return errorResponse(405, 'Method Not Allowed');

        // 【型安全によるフールプルーフィング】
        // AdminApiSchema['admin_shop_create'] で定義された引数構造を強制し、
        // 開発時のプロパティ指定ミスを機械的に防ぎます。
        const body = JSON.parse(event.body || '{}') as AdminApiSchema['admin_shop_create'];
        const { owner_id, name, gm_ids } = body;
        
        if (!owner_id || !name) return errorResponse(400, 'Missing owner_id or name');

        // 【DB操作: GetItem】
        // [意図] オーナー候補となるユーザーの既存権限レコードを確認し、
        // プロフィールに登録されているメールアドレスを取得します（通知先として利用）。
        // [Key] PK: `USER#${owner_id}`, SK: 'SHOP'
        const userownerRes = await ddb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `USER#${owner_id}`, SK: 'SHOP' }
        }));

        let email = userownerRes?.Item?.email;

        // Email 不在時のフォールバック処理
        // システムの堅牢性を高めるため、DB にない場合は Cognito ユーザープールから直接属性を取得します。
        if (!email && owner_id && USER_POOL_ID) {
            try {
                const user = await cognito.send(new AdminGetUserCommand({
                    UserPoolId: USER_POOL_ID,
                    Username: owner_id
                }));
                email = user.UserAttributes?.find(attr => attr.Name === 'email')?.Value;
            } catch (e) {
                console.warn(`Failed to fetch owner email from Cognito: ${owner_id}`, e);
            }
        }

        const newShopId = generateId(); // ショップ固有の UUID 発行
        const now = new Date().toISOString();
        const gm_idslist = Array.isArray(gm_ids) ? gm_ids : [];

        // 【DB操作: PutItem (SHOP METADATA)】
        // [意図] ショップの基本属性を定義する正本レコードを作成します。
        // 通知先ユーザーID（Owner）や、初期のメーリングリスト情報を保持します。
        await ddb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                PK: `SHOP#${newShopId}`, SK: 'METADATA',
                name, email: email || null, owner_id, gm_ids: gm_idslist,
                order_notification_user_ids: [owner_id],
                inquiry_notification_user_ids: [owner_id],
                order_mailing_list: email ? [email] : [],
                inquiry_mailing_list: email ? [email] : [],
                GSI2_PK: `USER#${owner_id}`, GSI2_SK: now,
                ts_created_at: now, ts_updated_at: now
            }
        }));

        // 【DB操作: PutItem (DETAIL_HTML)】初期化
        // [意図] 肥大化が予想される HTML 系コンテンツを別レコードとして初期化します。
        // これにより、将来的に店舗説明が巨大になっても METADATA の読み取り速度を落としません。
        await ddb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                PK: `SHOP#${newShopId}`, SK: 'DETAIL_HTML',
                detail_html: "", html_image_urls: [],
                ts_created_at: now, ts_updated_at: now
            }
        }));

        // 【DB操作: PutItem (SETTINGS#SHIPPING_LABEL)】初期化（デフォルト設定）
        // [意図] 郵便および宅急便の配送ラベル印刷設定のデフォルト値をセットします。
        // フロントエンドの ShippingLabelSettings.tsx で定義されている
        // DEFAULT_POST_CONFIG / DEFAULT_EXPRESS_CONFIG と整合性を取っています。
        await ddb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                PK: `SHOP#${newShopId}`, SK: 'SETTINGS#SHIPPING_LABEL',
                shipping_label_settings: {
                    takkyubin: {
                        labelHeight: 50,
                        labelWidth: 86.4,
                        layout: {
                            orderIdPos: { enabled: false, fontSize: 6, x: 5, y: 85 },
                            productNamePos: { enabled: true, fontSize: 8, x: 2, y: 44.5 },
                            recipientAddressPos: { enabled: true, fontSize: 9, maxWidth: 80, x: 2, y: 7 },
                            recipientNamePos: { enabled: true, fontSize: 12, fontWeight: 'bold', maxWidth: 80, x: 1.5, y: 20 },
                            recipientPhonePos: { enabled: true, fontSize: 10, maxWidth: 80, x: 50, y: 2 },
                            recipientZipPos: { enabled: true, fontSize: 10, x: 2, y: 2 },
                            senderAddressPos: { enabled: true, fontSize: 7, maxWidth: 80, x: 2, y: 37 },
                            senderNamePos: { enabled: true, fontSize: 9, x: 5, y: 40.5 },
                            senderPhonePos: { enabled: true, fontSize: 8, x: 58, y: 33.5 },
                            senderZipPos: { enabled: true, fontSize: 8, x: 2, y: 33.5 }
                        },
                        paper: {
                            cols: 2, cols_gap: 0, offset_x: 0, offset_y: 0,
                            pageHeight: 297, pageWidth: 210, rows: 4, rows_gap: 0
                        }
                    },
                    yubin: {
                        labelHeight: 50.8,
                        labelWidth: 86.4,
                        layout: {
                            orderIdPos: { enabled: false, fontSize: 7, x: 15, y: 130 },
                            preferredDatePos: { enabled: false, fontSize: 9, maxWidth: 85, x: 15, y: 124 },
                            preferredTimePos: { enabled: false, fontSize: 9, maxWidth: 85, x: 15, y: 131 },
                            productNamePos: { enabled: true, fontSize: 9, maxWidth: 80, x: 2, y: 44 },
                            recipientAddressPos: { enabled: true, fontSize: 10, maxWidth: 80, x: 2, y: 7.5 },
                            recipientNamePos: { enabled: true, fontSize: 16, fontWeight: 'bold', maxWidth: 80, x: 2, y: 22 },
                            recipientPhonePos: { enabled: false, fontSize: 10, maxWidth: 85, x: 15, y: 65 },
                            recipientZipPos: { enabled: true, fontSize: 12, x: 2, y: 2.5 },
                            senderAddressPos: { enabled: true, fontSize: 8, maxWidth: 80, x: 2, y: 36 },
                            senderNamePos: { enabled: true, fontSize: 10, maxWidth: 80, x: 5, y: 39.5 },
                            senderPhonePos: { enabled: true, fontSize: 8, maxWidth: 80, x: 60, y: 33 },
                            senderZipPos: { enabled: true, fontSize: 9, x: 2, y: 32.5 }
                        },
                        paper: {
                            cols: 2, cols_gap: 0, offset_x: 18.6, offset_y: 21.2,
                            pageHeight: 297, pageWidth: 210, rows: 5, rows_gap: 0
                        }
                    }
                },
                ts_created_at: now, ts_updated_at: now
            }
        }));

        // 【DB操作: UpdateItem (OWNER)】
        // [意図] オーナーのユーザーレコードに対し、所有ショップ ID リストを追加更新します。
        // [Key] PK: `USER#${owner_id}`, SK: 'SHOP'
        // list_append と if_not_exists を組み合わせることで、リストが未存在の場合でも安全にアトミック更新（規格化）します。
        const ownerUserRes = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `USER#${owner_id}`, SK: 'SHOP' } }));
        if (!ownerUserRes.Item) {
            // 新規ユーザーオーナーの場合はレコードを新規作成
            await ddb.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                    PK: `USER#${owner_id}`,
                    SK: 'SHOP',
                    email: email || null,
                    roles: ['SHOP_MANAGER'],
                    owner_shop_ids: [newShopId],
                    gm_shop_ids: [],
                    ts_created_at: now,
                    ts_updated_at: now
                }
            }));
        } else {
            // 既存ユーザーオーナーの場合は従来通りアップデート
            await ddb.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${owner_id}`, SK: 'SHOP' },
                UpdateExpression: 'SET owner_shop_ids = list_append(if_not_exists(owner_shop_ids, :empty_list), :new_shop_list), email = :email, ts_updated_at = :now',
                ExpressionAttributeValues: { ':new_shop_list': [newShopId], ':empty_list': [], ':email': email || null, ':now': now }
            }));

            // ロールの付与 (SHOP_MANAGER)
            try {
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `USER#${owner_id}`, SK: 'SHOP' },
                    UpdateExpression: 'SET #roles = list_append(if_not_exists(#roles, :empty_list), :owner_role_list)',
                    ConditionExpression: 'attribute_not_exists(#roles) OR NOT contains(#roles, :owner_role_str)',
                    ExpressionAttributeNames: { '#roles': 'roles' },
                    ExpressionAttributeValues: { ':owner_role_list': ['SHOP_MANAGER'], ':owner_role_str': 'SHOP_MANAGER', ':empty_list': [] }
                }));
            } catch (e: any) {
                if (e.name !== 'ConditionalCheckFailedException') throw e;
            }
        }

        // 【DB操作: UpdateItem (GM - ゼネラルマネージャー)】
        // [意図] 指定された各 GM ユーザーの管理ショップリストに新規ショップを追加し、
        // かつロール（GENERAL_MANAGER）を付与します。
        for (const gmid of gm_idslist) {
            // GM のメールアドレスを取得（通知用）
            let gmEmail = null;
            let gmUserRes = null;
            try {
                gmUserRes = await ddb.send(new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `USER#${gmid}`, SK: 'SHOP' }
                }));
                gmEmail = gmUserRes.Item?.email;
                if (!gmEmail && USER_POOL_ID) {
                    const cognitoRes = await cognito.send(new AdminGetUserCommand({
                        UserPoolId: USER_POOL_ID,
                        Username: gmid
                    }));
                    gmEmail = cognitoRes.UserAttributes?.find(attr => attr.Name === 'email')?.Value;
                }
            } catch (e) {
                console.warn(`Failed to fetch GM email: ${gmid}`, e);
            }

            if (!gmUserRes?.Item) {
                // 新規ユーザー GM の場合はレコードを新規作成
                await ddb.send(new PutCommand({
                    TableName: TABLE_NAME,
                    Item: {
                        PK: `USER#${gmid}`,
                        SK: 'SHOP',
                        email: gmEmail || null,
                        roles: ['SHOP_MANAGER', 'GENERAL_MANAGER'],
                        owner_shop_ids: [],
                        gm_shop_ids: [newShopId],
                        ts_created_at: now,
                        ts_updated_at: now
                    }
                }));
            } else {
                // 既存ユーザー GM の場合は従来通りアップデート
                // 管理ショップ ID の追加（アトミック操作）
                await ddb.send(new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `USER#${gmid}`, SK: 'SHOP' },
                    UpdateExpression: 'SET gm_shop_ids = list_append(if_not_exists(gm_shop_ids, :empty_list), :new_shop_list), email = :email, ts_updated_at = :now',
                    ExpressionAttributeValues: { ':new_shop_list': [newShopId], ':empty_list': [], ':email': gmEmail || null, ':now': now }
                }));

                // ロールの付与（排他制御）
                // ConditionExpression を使用し、既にロールを持っている場合は二重に追加しない「フールプルーフ」な更新を行います。
                try {
                    await ddb.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `USER#${gmid}`, SK: 'SHOP' },
                        UpdateExpression: 'SET #roles = list_append(if_not_exists(#roles, :empty_list), :gm_role_list)',
                        ConditionExpression: 'attribute_not_exists(#roles) OR NOT contains(#roles, :gm_role_str)',
                        ExpressionAttributeNames: { '#roles': 'roles' },
                        ExpressionAttributeValues: { ':gm_role_list': ['GENERAL_MANAGER'], ':gm_role_str': 'GENERAL_MANAGER', ':empty_list': [] }
                    }));
                } catch (e: any) {
                    // 条件不一致（既にロールあり）の場合はエラーにせず、正常系として継続
                    if (e.name !== 'ConditionalCheckFailedException') throw e;
                }
            }
        }

        // 成功レスポンス（ショップ ID を返すことでフロントエンドでの遷移や通知を容易化）
        return apiResponse(201, { shop_id: newShopId, message: 'Shop created' });

    } catch (error: any) {
        // 想定外のエラーログ出力（原因追跡を機械的に行うため、詳細を Stack Trace とともに出力）
        console.error('Admin shop create error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
