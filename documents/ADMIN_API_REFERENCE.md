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
