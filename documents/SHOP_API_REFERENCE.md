# ショップ用API一覧 (Shop API List)

各APIの詳細な技術仕様（リクエストパラメータ、レスポンス形式、DB操作等）については、それぞれのソースコード先頭のコメントブロックを参照してください。

| 名前 | 概要 | ソースコード |
| :--- | :--- | :--- |
| ショップ作成 | 新規ショップの作成（基本情報・初期オーナー設定）を行います。 | [shop_create.ts](../infra/lambda/shop_create.ts) |
| ショップ一覧取得 | ログインユーザーが管理・アクセス可能なショップ一覧を取得します。 | [shop_list.ts](../infra/lambda/shop_list.ts) |
| ショップ詳細・更新 | ショップ詳細情報の取得、および名称や画像等の更新を行います。 | [shop_details.ts](../infra/lambda/shop_details.ts) |
| プロダクト操作 | ショップ内の商品（プロダクト）のCRUD操作（作成・一覧・ステータス更新・削除）を行います。 | [shop_products.ts](../infra/lambda/shop_products.ts) |
| プロダクトインポート | オーナーが持つ他のショップから商品情報をインポートします。 | [shop_products_import.ts](../infra/lambda/shop_products_import.ts) |
| 画像アップロードURL発行 | 商品画像アップロード用の署名付きS3URL(Presigned URL)を発行します。 | [shop_products_uploadurl.ts](../infra/lambda/shop_products_uploadurl.ts) |
| S3画像削除 | ショップに関連するS3上の画像ファイルを安全に削除します。 | [shop_delete_images.ts](../infra/lambda/shop_delete_images.ts) |
| QRコード操作 | ショップのQRコード一覧取得、商品とのリンク、有効化等の管理操作を行います。 | [shop_qr.ts](../infra/lambda/shop_qr.ts) |
| オーダー操作 | ユーザーからの配送先情報の取得や、商品の発送完了ステータスへの更新等を行います。 | [shop_orders.ts](../infra/lambda/shop_orders.ts) |
| 管理者一覧取得 | ショップに紐づくオーナーおよびゼネラルマネージャー(GM)の一覧を取得します。 | [shop_admins.ts](../infra/lambda/shop_admins.ts) |

---
> [!NOTE]
> すべてのエンドポイントにおいて、`Authorization` ヘッダーによるCognitoユーザー認証が必須です。
> また、各API内部で、対象ショップのオーナーまたはGMであるかの権限チェック(`checkShopOwnerOrGM`)が実行されます。
