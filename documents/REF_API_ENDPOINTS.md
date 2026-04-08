# 管理者用API一覧 (Admin API List)

各APIの詳細な技術仕様（リクエストパラメータ、レスポンス形式等）については、それぞれのソースコード先頭のコメントブロックを参照してください。

| 名前 | 概要 | ソースコード |
| :--- | :--- | :--- |
| 管理者認証チェック | 管理者として正しく認証されているかを確認します。 | [admin_check.ts](../infra/lambda/admin_check.ts) |
| データベースダンプ | 指定されたPKに紐付く全データを取得します（デバッグ用）。 | [admin_dump.ts](../infra/lambda/admin_dump.ts) |
| ゼネラルマネージャー紐付け | ユーザーをショップの「GM」として設定し、権限を付与します。 | [admin_links.ts](../infra/lambda/admin_links.ts) |
| オーナー変更 | ショップの所有権を別のユーザーに移譲します。 | [admin_changeowner.ts](../infra/lambda/admin_changeowner.ts) |
| QRコード一覧・検索 | QRコードのリスト取得、またはUUID/PINでの検索を行います。 | [admin_qr_list.ts](../infra/lambda/admin_qr_list.ts) |
| QRコード生成 | 新しいQRコードとPINをバッチで一括生成します。 | [admin_qr_generate.ts](../infra/lambda/admin_qr_generate.ts) |
| QRコード停止・解除 | 特定のQRコードをBAN（利用停止）または解除します。 | [admin_qr_ban.ts](../infra/lambda/admin_qr_ban.ts) |
| BAN済みQRコード削除 | 停止状態のQRコードを物理削除します。 | [admin_qr_deleteban.ts](../infra/lambda/admin_qr_deleteban.ts) |
| カードデザイン管理 | カードデザイン（背景、サムネイル）のCRUD操作とURL発行を行います。 | [admin_carddesigns.ts](../infra/lambda/admin_carddesigns.ts) |

---
> [!NOTE]
> すべてのエンドポイントにおいて、`Authorization` ヘッダーによる管理者認証が必須です。


# ショップ用API一覧 (Shop API List)

各APIの詳細な技術仕様（リクエストパラメータ、レスポンス形式、DB操作等）については、それぞれのソースコード先頭のコメントブロックを参照してください。

| 名前 | 概要 | エンドポイント (`POST`) | 必須パラメータ (Body) | ソースコード |
| :--- | :--- | :--- | :--- | :--- |
| ショップ作成 | 新規ショップの作成 | `/shop/create` | `name`, `owner_id` | [shop_create.ts](../infra/lambda/shop_create.ts) |
| ショップ一覧取得 | ログインユーザーの管理ショップ一覧 | `/shop/list` | - | [shop_list.ts](../infra/lambda/shop_list.ts) |
| ショップ詳細取得 | ショップのメタデータ取得 | `/shop/details/get` | `shopId` | [shop_details.ts](../infra/lambda/shop_details.ts) |
| ショップ詳細更新 | ショップ情報（名称・画像等）の更新 | `/shop/details/update` | `shopId`, `shopData` | [shop_details.ts](../infra/lambda/shop_details.ts) |
| プロダクト一覧 | ショップ内の商品一覧取得 | `/shop/products/list` | `shopId` | [shop_products.ts](../infra/lambda/shop_products.ts) |
| プロダクト作成 | 新規商品の作成 | `/shop/products/create` | `shopId`, `productData` | [shop_products.ts](../infra/lambda/shop_products.ts) |
| プロダクト更新 | 商品情報の更新 | `/shop/products/update` | `shopId`, `productId`, `productData` | [shop_products.ts](../infra/lambda/shop_products.ts) |
| プロダクト削除 | 商品の削除 | `/shop/products/delete` | `shopId`, `productId` | [shop_products.ts](../infra/lambda/shop_products.ts) |
| インポート候補 | 他ショップの商品一覧 [試験段階] | `/shop/products/import/list` | `shopId` | [shop_products_import.ts](../infra/lambda/shop_products_import.ts) |
| インポート実行 | 選んだ商品のコピー [試験段階] | `/shop/products/import/execute` | `shopId`, `copyItems` | [shop_products_import.ts](../infra/lambda/shop_products_import.ts) |
| 画像アップロードURL | S3 Presigned URL発行 | `/shop/products/uploadurl` | `shopId`, `fileName` | [shop_products_uploadurl.ts](../infra/lambda/shop_products_uploadurl.ts) |
| S3画像削除 | 画像ファイルの削除 | `/shop/delete/images` | `shopId`, `urls` | [shop_delete_images.ts](../infra/lambda/shop_delete_images.ts) |
| QR一覧取得 | ショップに紐づくQRコード一覧 | `/shop/qr/list` | `shopId` | [shop_qr.ts](../infra/lambda/shop_qr.ts) |
| QRリンク | 商品とQRの紐付け | `/shop/qr/link` | `shopId`, `qr_id`, `product_id` | [shop_qr.ts](../infra/lambda/shop_qr.ts) |
| QR有効化 | QRコードをACTIVEにする | `/shop/qr/activate` | `shopId`, `qr_id` | [shop_qr.ts](../infra/lambda/shop_qr.ts) |
| QR状態チェック | QRコードの簡易検証 | `/shop/qrcodecheck` | `shopId`, `qr_id` | [shop_qr.ts](../infra/lambda/shop_qr.ts) |
| オーダー一覧 | 注文（配送先情報）一覧取得 | `/shop/orders/list` | `shopId` | [shop_orders.ts](../infra/lambda/shop_orders.ts) |
| オーダーステータス更新 | 発送完了等の状態更新 | `/shop/orders/update` | `shopId`, `orderId`, `status` | [shop_orders.ts](../infra/lambda/shop_orders.ts) |
| 管理者一覧取得 | オーナー・GM一覧の取得 | `/shop/admins` | `shopId` | [shop_admins.ts](../infra/lambda/shop_admins.ts) |

---
> [!NOTE]
> すべてのエンドポイントにおいて、`authorization` ヘッダーによるCognitoユーザー認証が必須です。
> また、各API内部で、対象ショップのオーナーまたはGMであるかの権限チェック(`checkShopOwnerOrGM`)が実行されます。


# 受取人用API一覧 (Receive API List)

各APIの詳細な技術仕様（リクエストパラメータ、レスポンス形式、DB操作等）については、それぞれのソースコード先頭のコメントブロックを参照してください。

| 名前 | 概要 | エンドポイント (`POST`) | ソースコード |
| :--- | :--- | :--- | :--- |
| PIN検証 | UUIDとPINの検証、商品・ショップメタデータ取得 | `/receive/verify` | [receive_verify.ts](../infra/lambda/receive_verify.ts) |
| 配送先情報送信 | 配送先情報の登録、オーダー確定通知 | `/receive/submit` | [receive_submit.ts](../infra/lambda/receive_submit.ts) |
| 受取完了通知 | ステータスを「受取済み」に更新 | `/receive/completed` | [receive_completed.ts](../infra/lambda/receive_completed.ts) |
| メッセージ取得 | チャット履歴の取得 | `/receive/chat/get` | [receive_chat.ts](../infra/lambda/receive_chat.ts) |
| メッセージ送信 | 新規メッセージの投稿 | `/receive/chat/send` | [receive_chat.ts](../infra/lambda/receive_chat.ts) |
| 購読設定 | メール通知（ギフト発送時等）の購読登録 | `/receive/subscription` | [receive_subscription.ts](../infra/lambda/receive_subscription.ts) |
| 送り主情報更新 | プロフィールの更新 | `/receive/sender/update` | [receive_sender.ts](../infra/lambda/receive_sender.ts) |
| 送り主情報読込 | 過去の送り主データの取得 | `/receive/sender/load` | [receive_sender.ts](../infra/lambda/receive_sender.ts) |
| 送り主保存 | 送り主情報のユーザー保存 | `/receive/sender/save` | [receive_sender.ts](../infra/lambda/receive_sender.ts) |
| 画像URL発行 | S3画像アップロード用URL発行 | `/receive/uploadurl/get` | [receive_upload_url.ts](../infra/lambda/receive_upload_url.ts) |

---
> [!NOTE]
> 受取人用エンドポイント（`/verify` を除く）では、カスタムオーソライザー（`ReceiveAuthorizer`）が使用されます。
> リクエストのヘッダーに `x-qr-id` および `x-qr-pin` を含めることで認証・認可が行われます。


