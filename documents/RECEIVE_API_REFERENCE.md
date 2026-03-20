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
> リクエストのヘッダーに `X-QR-UUID` および `X-QR-PIN` を含めることで認証・認可が行われます。
