# 管理者用API一覧 (Admin API List)

各APIの詳細な技術仕様（リクエストパラメータ、レスポンス形式等）については、それぞれのソースコード先頭のコメントブロックを参照してください。

| 名前 | 概要 | DB操作 (Commands) | ソースコード |
| :--- | :--- | :--- | :--- |
| 管理者認証チェック | 管理者として正しく認証されているかを確認します。 | - | [admin_check.ts](../infra/lambda/admin_check.ts) |
| データベースダンプ | 指定されたPKに紐付く全データを取得します（デバッグ用）。 | `QueryCommand` / `GetCommand` | [admin_dump.ts](../infra/lambda/admin_dump.ts) |
| ゼネラルマネージャー紐付け | ユーザーをショップの「GM」として設定し、権限を付与します。 | `GetCommand` + `UpdateCommand` | [admin_links.ts](../infra/lambda/admin_links.ts) |
| オーナー変更 | ショップの所有権を別のユーザーに移譲します。 | `TransactWriteCommand` (Atomic Ownership Transfer) | [admin_changeowner.ts](../infra/lambda/admin_changeowner.ts) |
| QRコード一覧・検索 | QRコードのリスト取得、またはUUID/PINでの検索を行います。 | `QueryCommand` (GSI2) / `ScanCommand` / `BatchGetCommand` | [admin_qr_list.ts](../infra/lambda/admin_qr_list.ts) |
| QRコード生成 | 新しいQRコードとPINをバッチで一括生成します。 | `BatchWriteCommand` (QR Metadata) + `UpdateCommand` (CARD_ORDER) | [admin_qr_generate.ts](../infra/lambda/admin_qr_generate.ts) |
| QRコード停止・解除 | 特定のQRコードをBAN（利用停止）または解除します。 | `UpdateCommand` (QR Metadata Status) | [admin_qr_ban.ts](../infra/lambda/admin_qr_ban.ts) |
| BAN済みQRコード削除 | 停止状態のQRコードを物理削除します。 | `BatchWriteCommand` (Delete) + `QueryCommand` | [admin_qr_deleteban.ts](../infra/lambda/admin_qr_deleteban.ts) |
| カードデザイン管理 | カードデザイン（背景、サムネイル）のCRUD操作とURL発行を行います。 | `PutCommand` / `QueryCommand` / `GetCommand` / `UpdateCommand` / `DeleteCommand` | [admin_carddesigns.ts](../infra/lambda/admin_carddesigns.ts) |
| カード発注管理 | 各ショップからのカード印刷依頼の管理・ステータス更新を行います。 | `QueryCommand` (GSI1/GSI2) / `BatchGetCommand` / `PutCommand` / `UpdateCommand` | [admin_card_orders.ts](../infra/lambda/admin_card_orders.ts) |
| ショップ作成(Admin) | 管理者によるショップ新規発行とオーナー紐付けを行います。 | `PutCommand` (Shop Metadata) + `GetCommand` (User) | [admin_shop_create.ts](../infra/lambda/admin_shop_create.ts) |
| カードデザイン紐付け | ショップが利用可能な限定デザインを管理します。 | `GetCommand` + `UpdateCommand` | [admin_shop_carddesign_link.ts](../infra/lambda/admin_shop_carddesign_link.ts) |

---
> [!NOTE]
> すべてのエンドポイントにおいて、`Authorization` ヘッダーによる管理者認証が必須です。


# ショップ用API一覧 (Shop API List)

各APIの詳細な技術仕様（リクエストパラメータ、レスポンス形式、DB操作等）については、それぞれのソースコード先頭のコメントブロックを参照してください。

| 名前 | 概要 | エンドポイント (`POST`) | DB操作 (Commands) | ソースコード |
| :--- | :--- | :--- | :--- | :--- |
| ショップ作成 | 新規ショップの作成 | `/shop/create` | `PutCommand` (Shop Metadata) | [shop_create.ts](../infra/lambda/shop_create.ts) |
| ショップ一覧取得 | ログインユーザーの管理ショップ一覧 | `/shop/list` | `GetCommand` (User Shop) + `BatchGetCommand` (Shop) / `QueryCommand` / `PutCommand` | [shop_list.ts](../infra/lambda/shop_list.ts) |
| ショップ詳細取得 | ショップのメタデータ取得 | `/shop/details/get` | `GetCommand` (Shop Metadata) + `BatchGetCommand` (Design Enrichment) | [shop_details.ts](../infra/lambda/shop_details.ts) |
| ショップ詳細更新 | ショップ情報（名称・画像等）の更新 | `/shop/details/update` | `UpdateCommand` (Shop Metadata) | [shop_details.ts](../infra/lambda/shop_details.ts) |
| プロダクト一覧 | ショップ内の商品一覧取得 | `/shop/products/list` | `QueryCommand` (Product) + `BatchGetCommand` (Design Enrichment) | [shop_products.ts](../infra/lambda/shop_products.ts) |
| プロダクト作成 | 新規商品の作成 | `/shop/products/create` | `PutCommand` (Product) | [shop_products.ts](../infra/lambda/shop_products.ts) |
| プロダクト更新 | 商品情報の更新 | `/shop/products/update` | `GetCommand` + `UpdateCommand` (Product) | [shop_products.ts](../infra/lambda/shop_products.ts) |
| プロダクト削除 | 商品の削除 | `/shop/products/delete` | `PutCommand` (Logical Delete) + `QueryCommand` (Check Active QRs) | [shop_products.ts](../infra/lambda/shop_products.ts) |
| インポート候補 | 他ショップの商品一覧 [試験段階] | `/shop/products/import/list` | `ScanCommand` / `QueryCommand` (GSI2) | [shop_products_import.ts](../infra/lambda/shop_products_import.ts) |
| インポート実行 | 選んだ商品のコピー [試験段階] | `/shop/products/import/execute` | `BatchGetCommand` / `QueryCommand` (Source) + `PutCommand` (Target) | [shop_products_import.ts](../infra/lambda/shop_products_import.ts) |
| 画像アップロードURL | S3 Presigned URL発行 | `/shop/products/uploadurl` | - (S3 Presigned URL) | [shop_products_uploadurl.ts](../infra/lambda/shop_products_uploadurl.ts) |
| S3画像削除 | 画像ファイルの削除 | `/shop/delete/images` | - (S3 Object Delete) | [shop_delete_images.ts](../infra/lambda/shop_delete_images.ts) |
| QR一覧取得 | ショップに紐づくQRコード一覧 | `/shop/qr/list` | `QueryCommand` (GSI2 QR) + `UpdateCommand` (Lazy Expire) | [shop_qr.ts](../infra/lambda/shop_qr.ts) |
| QRリンク | 商品とQRの紐付け | `/shop/qr/link` | `GetCommand` + `UpdateCommand` (QR Metadata) | [shop_qr.ts](../infra/lambda/shop_qr.ts) |
| QR有効化 | QRコードをACTIVEにする | `/shop/qr/activate` | `GetCommand` + `UpdateCommand` (QR Metadata) | [shop_qr.ts](../infra/lambda/shop_qr.ts) |
| QR状態チェック | QRコードの簡易検証 | `/shop/qrcodecheck` | `GetCommand` (QR Metadata) + `UpdateCommand` (Lazy Expire) | [shop_qr.ts](../infra/lambda/shop_qr.ts) |
| オーダー一覧 | 注文（配送先情報）一覧取得 | `/shop/orders/list` | `QueryCommand` (GSI2) + `BatchGetCommand` (Order/Design Enrichment) | [shop_orders.ts](../infra/lambda/shop_orders.ts) |
| オーダーステータス更新 | 発送完了等の状態更新 | `/shop/orders/update` | `GetCommand` + `UpdateCommand` (QR Status & Order Tracking) | [shop_orders.ts](../infra/lambda/shop_orders.ts) |
| 管理者一覧取得 | オーナー・GM一覧の取得 | `/shop/admins` | `GetCommand` (Shop Metadata + Each User) | [shop_admins.ts](../infra/lambda/shop_admins.ts) |
| カード発注作成 | 印刷用カードの新規発注 | `/shop/card/orders/create` | `PutCommand` (Card Order) | [shop_card_orders.ts](../infra/lambda/shop_card_orders.ts) |
| カード発注一覧 | 自ショップの発注履歴取得 | `/shop/card/orders/list` | `QueryCommand` + `BatchGetCommand` (Design Enrichment) | [shop_card_orders.ts](../infra/lambda/shop_card_orders.ts) |
| カード発注キャンセル | 受付中の発注の取り消し | `/shop/card/orders/cancel` | `GetCommand` + `UpdateCommand` (Card Order Status) | [shop_card_orders.ts](../infra/lambda/shop_card_orders.ts) |
| カード発注完了 | 納品済みカードの受取確認 | `/shop/card/orders/complete` | `GetCommand` + `UpdateCommand` (Card Order Status) | [shop_card_orders.ts](../infra/lambda/shop_card_orders.ts) |

---
> [!NOTE]
> すべてのエンドポイントにおいて、`authorization` ヘッダーによるCognitoユーザー認証が必須です。
> また、各API内部で、対象ショップのオーナーまたはGMであるかの権限チェック(`checkShopOwnerOrGM`)が実行されます。


# 受取人用API一覧 (Receive API List)

各APIの詳細な技術仕様（リクエストパラメータ、レスポンス形式、DB操作等）については、それぞれのソースコード先頭のコメントブロックを参照してください。

| 名前 | 概要 | エンドポイント (`POST`) | DB操作 (Commands) | ソースコード |
| :--- | :--- | :--- | :--- | :--- |
| PIN検証 | UUIDとPINの検証、商品・ショップメタデータ取得 | `/receive/verify` | `GetCommand` (QR Meta) + `BatchGetCommand` (Wide Enrichment) | [receive_verify.ts](../infra/lambda/receive_verify.ts) |
| 配送先情報送信 | 配送先情報の登録、オーダー確定通知 | `/receive/submit` | `TransactWriteCommand` (QR Status & Order Put) + `UpdateCommand` (Chat) | [receive_submit.ts](../infra/lambda/receive_submit.ts) |
| 受取完了通知 | ステータスを「受取済み」に更新 | `/receive/completed` | `GetCommand` + `UpdateCommand` (Condition: SHIPPED) | [receive_completed.ts](../infra/lambda/receive_completed.ts) |
| メッセージ取得 | チャット履歴の取得 | `/receive/chat/get` | `GetCommand` (Chat/Sender Snapshot) | [receive_chat.ts](../infra/lambda/receive_chat.ts) |
| メッセージ送信 | 新規メッセージの投稿 | `/receive/chat/send` | `GetCommand` + `UpdateCommand` (Atomic list_append & ADD) | [receive_chat.ts](../infra/lambda/receive_chat.ts) |
| 購読設定 | メール通知（ギフト発送時等）の購読登録 | `/receive/subscription` | `GetCommand` + `UpdateCommand` (Chat Preferences) | [receive_subscription.ts](../infra/lambda/receive_subscription.ts) |
| 送り主情報更新 | プロフィールの更新 | `/receive/sender/update` | `GetCommand` (QR Status) + `UpdateCommand` (Chat/Email Sync) | [receive_sender.ts](../infra/lambda/receive_sender.ts) |
| 送り主情報読込 | 過去の送り主データの取得 | `/receive/sender/load` | `GetCommand` (User SENDER) + `UpdateCommand` (Chat SenderID) | [receive_sender.ts](../infra/lambda/receive_sender.ts) |
| 送り主保存 | 送り主情報のユーザー保存 | `/receive/sender/save` | `UpdateCommand` (Upsert Master Profile) + `S3 CopyObject` | [receive_sender.ts](../infra/lambda/receive_sender.ts) |
| 画像URL発行 | S3画像アップロード用URL発行 | `/receive/uploadurl/get` | - (S3 Presigned URL) | [receive_upload_url.ts](../infra/lambda/receive_upload_url.ts) |
| 画像URL発行 | S3画像アップロード用URL発行 | `/receive/uploadurl/get` | - (S3 Presigned URL) | [receive_upload_url.ts](../infra/lambda/receive_upload_url.ts) |

---
> [!NOTE]
> 受取人用エンドポイント（`/verify` を除く）では、カスタムオーソライザー（`ReceiveAuthorizer`）が使用されます。
> リクエストのヘッダーに `x-qr-id` および `x-qr-pin` を含めることで認証・認可が行われます。



> [!IMPORTANT]
> **属性の命名規則について**
> 原則として、リクエストおよびDB属性名は `snake_case` で統一されています。
> ただし、過去の経緯により `zipCode`, `preferredDate`, `preferredTime` などの `camelCase` 属性がDB内に残っている可能性があります。管理画面等の読み取り処理では、新旧両方の形式に対応する互換ロジックが実装されています。
