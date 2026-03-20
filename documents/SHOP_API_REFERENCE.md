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
| インポート候補 | 他ショップの商品一覧取得 | `/shop/products/import/list` | `shopId` | [shop_products_import.ts](../infra/lambda/shop_products_import.ts) |
| インポート実行 | 選んだ商品のコピー実行 | `/shop/products/import/execute` | `shopId`, `copyItems` | [shop_products_import.ts](../infra/lambda/shop_products_import.ts) |
| 画像アップロードURL | S3 Presigned URL発行 | `/shop/products/upload-url` | `shopId`, `fileName` | [shop_products_uploadurl.ts](../infra/lambda/shop_products_uploadurl.ts) |
| S3画像削除 | 画像ファイルの削除 | `/shop/delete/images` | `shopId`, `urls` | [shop_delete_images.ts](../infra/lambda/shop_delete_images.ts) |
| QR一覧取得 | ショップに紐づくQRコード一覧 | `/shop/qr/list` | `shopId` | [shop_qr.ts](../infra/lambda/shop_qr.ts) |
| QRリンク | 商品とQRの紐付け | `/shop/qr/link` | `shopId`, `qr_id`, `product_id` | [shop_qr.ts](../infra/lambda/shop_qr.ts) |
| QR有効化 | QRコードをACTIVEにする | `/shop/qr/activate` | `shopId`, `qr_id` | [shop_qr.ts](../infra/lambda/shop_qr.ts) |
| QR状態チェック | QRコードの簡易検証 | `/shop/qrcode-check` | `shopId`, `qr_id` | [shop_qr.ts](../infra/lambda/shop_qr.ts) |
| オーダー一覧 | 注文（配送先情報）一覧取得 | `/shop/orders/list` | `shopId` | [shop_orders.ts](../infra/lambda/shop_orders.ts) |
| オーダーステータス更新 | 発送完了等の状態更新 | `/shop/orders/update` | `shopId`, `orderId`, `status` | [shop_orders.ts](../infra/lambda/shop_orders.ts) |
| 管理者一覧取得 | オーナー・GM一覧の取得 | `/shop/admins` | `shopId` | [shop_admins.ts](../infra/lambda/shop_admins.ts) |

---
> [!NOTE]
> すべてのエンドポイントにおいて、`Authorization` ヘッダーによるCognitoユーザー認証が必須です。
> また、各API内部で、対象ショップのオーナーまたはGMであるかの権限チェック(`checkShopOwnerOrGM`)が実行されます。
