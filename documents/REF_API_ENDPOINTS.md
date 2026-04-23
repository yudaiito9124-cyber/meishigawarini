# 管理者用API一覧 (Admin API List)

各APIの詳細な技術仕様（リクエストパラメータ、レスポンス形式等）については、それぞれのソースコード先頭のコメントブロックを参照してください。

| 名前 | 概要 | エンドポイント (`POST`) | DB操作 (Commands) | ソースコード |
| :--- | :--- | :--- | :--- | :--- |
| 管理者認証チェック | 管理者として正しく認証されているかを確認します。 | `/admin` (`GET`) | - | [admin_check.ts](../infra/lambda/admin_check.ts) |
| データベースダンプ | 指定されたPKに紐付く全データを取得します（デバッグ用）。 | `/admin/dump` | `QueryCommand` / `GetCommand` | [admin_dump.ts](../infra/lambda/admin_dump.ts) |
| ゼネラルマネージャー紐付け | ユーザーをショップの「GM」として設定し、権限を付与します。 | `/admin/links` | `GetCommand` + `UpdateCommand` | [admin_links.ts](../infra/lambda/admin_links.ts) |
| オーナー変更 | ショップの所有権を別のユーザーに移譲します。 | `/admin/changeowner` | `TransactWriteCommand` (Atomic Ownership Transfer) | [admin_changeowner.ts](../infra/lambda/admin_changeowner.ts) |
| QRコード一覧・検索 | QRコードのリスト取得、またはUUID/PINでの検索を行います。 | `/admin/qr/list` | `QueryCommand` (GSI2) / `ScanCommand` / `BatchGetCommand` | [admin_qr_list.ts](../infra/lambda/admin_qr_list.ts) |
| QRコード生成 | 新しいQRコードとPINをバッチで一括生成します。 | `/admin/qr/generate` | `BatchWriteCommand` (QR Metadata) + `UpdateCommand` (CARD_ORDER) | [admin_qr_generate.ts](../infra/lambda/admin_qr_generate.ts) |
| QRコード停止・解除 | 特定のQRコードをBAN（利用停止）または解除します。 | `/admin/qr/ban` | `UpdateCommand` (QR Metadata Status) | [admin_qr_ban.ts](../infra/lambda/admin_qr_ban.ts) |
| BAN済みQRコード削除 | 停止状態のQRコードを物理削除します。 | `/admin/qr/deleteban` | `BatchWriteCommand` (Delete) + `QueryCommand` | [admin_qr_deleteban.ts](../infra/lambda/admin_qr_deleteban.ts) |
| カードデザイン管理 | カードデザイン（背景、サムネイル）のCRUD操作とURL発行を行います。 | `/admin/carddesigns/*` | `PutCommand` / `QueryCommand` / `GetCommand` / `UpdateCommand` / `DeleteCommand` | [admin_carddesigns.ts](../infra/lambda/admin_carddesigns.ts) |
| カード発注管理 | 各ショップからのカード印刷依頼の管理・ステータス更新を行います。 | `/admin/card/orders/*` | `QueryCommand` (GSI1/GSI2) / `BatchGetCommand` / `PutCommand` / `UpdateCommand` | [admin_card_orders.ts](../infra/lambda/admin_card_orders.ts) |
| ショップ作成(Admin) | 管理者によるショップ新規発行とオーナー紐付けを行います。 | `/admin/shop/create` | `PutCommand` (Shop Metadata) + `GetCommand` (User) | [admin_shop_create.ts](../infra/lambda/admin_shop_create.ts) |
| カードデザイン紐付け | ショップが利用可能な限定デザインを管理します。 | `/admin/shop/carddesign/link` | `GetCommand` + `UpdateCommand` | [admin_shop_carddesign_link.ts](../infra/lambda/admin_shop_carddesign_link.ts) |

---
> [!NOTE]
> すべてのエンドポイントにおいて、`Authorization` ヘッダーによる管理者認証が必須です。


# ショップ用API一覧 (Shop API List)

各APIの詳細な技術仕様（リクエストパラメータ、レスポンス形式、DB操作等）については、それぞれのソースコード先頭のコメントブロックを参照してください。

| 名前 | 概要 | エンドポイント (`POST`) | DB操作 (Commands) | ソースコード |
| :--- | :--- | :--- | :--- | :--- |
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
| 管理者紐付け (Shop) | ショップのGMを追加 | `/shop/admins/link` | `GetCommand` + `UpdateCommand` | [shop_admins.ts](../infra/lambda/shop_admins.ts) |
| 管理者解除 (Shop) | ショップのGMを削除 | `/shop/admins/unlink` | `GetCommand` + `UpdateCommand` | [shop_admins.ts](../infra/lambda/shop_admins.ts) |
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
| ショップへのお問い合わせ | メール送信と管理用チャット通知 | `/receive/inquiry` | `GetCommand` + `TransactWriteCommand` (Unified Chat Notification) | [receive_inquiry.ts](../infra/lambda/receive_inquiry.ts) |

---
> [!NOTE]
> 受取人用エンドポイント（`/verify` を除く）では、カスタムオーソライザー（`ReceiveAuthorizer`）が使用されます。
> リクエストのヘッダーに `x-qr-id` および `x-qr-pin` を含めることで認証・認可が行われます。


# 汎用チャットAPI一覧 (Unified Chat API List)

> [!NOTE]
> **2026年4月 ステータス: デプロイ済み・本番稼働中**
> エンドポイント・型・遷移ルールの正本は `shared/api-types.ts` および `shared/unified-chat-workflows.ts` です。

このAPIグループは **1つのLambda関数** (`unified_chat.ts`) がすべてのエンドポイントを処理します。
通常のプロジェクト規約（1 Lambda = 1 API）とは異なる例外的な構成です。

ルーティングは Lambda 内部で `event.resource` の **完全一致**（`===`）により判定しています。

> [!WARNING]
> **実装上の重要な注意事項（ルーティングバグの教訓）**
>
> このLambdaはパスの `===` 完全一致でアクションを判定しています。かつて `endsWith('/get')` のような
> **部分一致**を使っていたため、`/unified/chat/messages/get` が `/unified/chat/get` と誤判定される
> バグが発生しました（2026年4月修正）。
>
> 複数エンドポイントを1Lambdaで処理する場合は、必ず完全一致または、より具体的なパスを先に判定してください。

### エンドポイント一覧

| 名前 | 概要 | エンドポイント (`POST`) | DB操作 (Commands) | ソースコード |
| :--- | :--- | :--- | :--- | :--- |
| チャット作成 | 参加者・種別を指定して新規チャットを作成 | `/unified/chat/create` | `TransactWriteCommand` (META + Membership + optional初期Message) | [unified_chat.ts](../infra/lambda/unified_chat.ts) |
| 受信箱一覧取得 | 参加者単位でチャット一覧を最新順取得 | `/unified/chat/list` | `QueryCommand` (GSI2 `CHAT_INBOX#{participantId}`) | [unified_chat.ts](../infra/lambda/unified_chat.ts) |
| チャット詳細取得 | チャット本体メタデータを1件取得 | `/unified/chat/get` | `GetCommand` (PK=`CHAT#{chat_id}`, SK=`META`) | [unified_chat.ts](../infra/lambda/unified_chat.ts) |
| メッセージ一覧取得 | 指定チャットのメッセージ履歴をページング取得 | `/unified/chat/messages/get` | `QueryCommand` (PK=`CHAT#{chat_id}`, SK begins_with `MSG#`) | [unified_chat.ts](../infra/lambda/unified_chat.ts) |
| メッセージ送信 | テキスト/ワークフローpayloadを送信 | `/unified/chat/messages/send` | `TransactWriteCommand` (Message追加 + META更新 + Membership更新) | [unified_chat.ts](../infra/lambda/unified_chat.ts) |
| 既読更新 | 参加者の既読カーソルと未読数を更新 | `/unified/chat/read/mark` | `UpdateCommand` (Membership `last_read_seq` + `unread_count_cache`) | [unified_chat.ts](../infra/lambda/unified_chat.ts) |
| ステータス更新 | チャットの状態（OPEN/RESOLVED等）を更新 | `/unified/chat/status/update` | `GetCommand` (META) + `TransactWriteCommand` (META + Membership status同期) | [unified_chat.ts](../infra/lambda/unified_chat.ts) |
| アップロードURL取得 | 添付ファイル用のPresigned URLを発行 | `/unified/chat/uploadurl/get` | `GetCommand` (META認可確認) + S3 Presign | [unified_chat.ts](../infra/lambda/unified_chat.ts) |

### 実装コメント（運用・保守メモ）

- チャット作成 (`/unified/chat/create`):
	現行仕様では参加者は「起票者 + ADMIN」の2者のみ許可されます。第三者の inbox へ混入させる入力を防ぐためです。
- 受信箱一覧 (`/unified/chat/list`):
	まず GSI2 で participant 単位の候補を取得し、`include_archived` / `chat_type` / `status` はアプリ側で追加絞り込みします。
- チャット詳細・メッセージ取得 (`/unified/chat/get`, `/unified/chat/messages/get`):
	いずれも先に META を取得してアクセス権を検証してから返却します（存在しない場合404、権限不足は403）。
- メッセージ送信 (`/unified/chat/messages/send`):
	`sender_id` は参加者一致 + 呼び出し元権限一致を必須化しています。DBには `sender_id`（主体）に加えて `sender_user_id`（実操作者）を保存します。
- 既読更新 (`/unified/chat/read/mark`):
	`last_read_seq <= last_message_seq` を強制し、`unread_count_cache` は差分再計算で整合を維持します。
- ステータス更新 (`/unified/chat/status/update`):
	遷移可否は `chat_type` ごとの workflow 定義に従い、META と参加者 inbox の status をトランザクションで同期更新します。
- アップロードURL取得 (`/unified/chat/uploadurl/get`):
	チャット参加権限の検証後にのみ Presigned URL を発行します。サイズ上限は Lambda 側定数で制御しています。
- 入力検証方針（重要）:
	必須項目・業務整合・workflow payload 検証は実装済みですが、未知キーを一括拒否する strict schema 検証は現時点で未導入です。

### DynamoDBデータ構造

| アイテム種別 | PK | SK | 主要フィールド |
| :--- | :--- | :--- | :--- |
| チャットメタ | `CHAT#{chat_id}` | `META` | `participants[]`, `status`, `last_message_seq`, `version` |
| メッセージ | `CHAT#{chat_id}` | `MSG#{seq:012d}` | `workflow_status`, `payload_type`, `payload{}`, `sender_id`, `sender_user_id` |
| 受信ボックス | `CHAT_INBOX#{participantId}` (GSI2_PK) | - | `unread_count_cache`, `last_read_seq` |

### メッセージのペイロード構造（審査結果: ADMIN_DECISION）

承認/却下メッセージの `payload` フィールドには以下が含まれます:

| フィールド | 型 | 説明 |
| :--- | :--- | :--- |
| `workflow_status` | `"APPROVED"` \| `"REJECTED"` | 審査結果（最も信頼性の高いフィールド） |
| `payload.approved` | `boolean` | 承認可否（true=承認, false=却下） |
| `payload.linked_shop_id` | `string` | 承認時に作成されたショップのID |
| `payload.default_design_id` | `string` | 割り当てられたデフォルトカードデザインのID |
| `payload.reason` | `string` | 審査コメント（却下理由など） |
| `payload.reviewed_at` | `string` | 審査日時（ISO 8601形式） |

### メッセージのペイロード構造（お問い合わせ: INQUIRY_SUBMITTED）

ゲスト（受取人）からショップへのお問い合わせメッセージの `payload` フィールドには以下が含まれます:

| フィールド | 型 | 説明 |
| :--- | :--- | :--- |
| `payload.qr_id` | `string` | お問い合わせの契機となったギフト（カード）のID |
| `payload.shopId` | `string` | 宛先ショップのID |
| `payload.shopName` | `string` | 宛先ショップの名称 |
| `payload.reply_email` | `string` | ユーザーが指定した返信先メールアドレス |
| `payload.phone` | `string` | ユーザーが指定した連絡先電話番号 |
| `payload.content` | `string` | お問い合わせ内容の本文 |

### フロントエンド通知コンポーネント

このAPIを使用するフロントエンドの共用通知コンポーネントは以下のファイルです:

- **ファイル**: [`frontend/components/chat/UnifiedChatNotifications.tsx`](../frontend/components/chat/UnifiedChatNotifications.tsx)
- **使用箇所**:
	- ショップ管理画面ヘッダー: [`frontend/components/shop/ShopHeader.tsx`](../frontend/components/shop/ShopHeader.tsx)（`participantId="SHOP#xxx"`）
	- ユーザーマイページ: [`frontend/app/[locale]/user/page.tsx`](../frontend/app/%5Blocale%5D/user/page.tsx)（`participantId="USER#xxx"`）

- **作成導線（現行）**:
	- `運営とチャット` ボタン: 起票者が `USER#...` なら `chat_type=USER_SUPPORT`、`SHOP#...` なら `chat_type=SHOP_SUPPORT` で新規チャット作成
	- `ショップ開設申請` ボタン: `chat_type=SHOP_OPENING` の申請フォーム送信

### 実装上の制約

> [!NOTE]
> 実装時は以下を必須とします:
> 1. **payload 検証**: `assertValidWorkflowPayload` または `isValidWorkflowPayload`（`shared/unified-chat-workflows.ts`）
> 2. **遷移検証**: `canTransitionTo`（不正なワークフロー遷移を防止）
> 3. **競合制御**: `version` フィールドを用いた楽観的ロック（同時更新による上書きを防止）
> 4. **整合更新**: メッセージ送信時は必ず `TransactWriteCommand` を使用（部分失敗を防止）



> [!IMPORTANT]
> **属性の命名規則について**
> 原則として、リクエストおよびDB属性名は `snake_case` で統一されています。
> ただし、過去の経緯により `zipCode`, `preferredDate`, `preferredTime` などの `camelCase` 属性がDB内に残っている可能性があります。管理画面等の読み取り処理では、新旧両方の形式に対応する互換ロジックが実装されています。
