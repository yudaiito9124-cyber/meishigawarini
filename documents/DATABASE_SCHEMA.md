# データベース仕様および操作一覧

本プロジェクト（名刺がわりに）では、AWS CDKを使用して構築された **Amazon DynamoDB** (テーブル名: `MeishiGawariniTableV2`) のシングルテーブルデザインが採用されています。様々な種類のデータが、`PK` (パーティションキー) と `SK` (ソートキー)、および2つのGSI (グローバルセカンダリインデックス) を活用して一つのテーブルに格納されています。

以下に、データベース内に存在するデータの種類（エンティティ）と、各項目についての一覧表をまとめます。

\# 使用しているデータテーブル内には古い規格のデータも含まれていますので、こことは異なる要素が含まれる可能性があります．

## 1. データの種類（エンティティ一覧）

| エンティティ種別 | PK (Partition Key) | SK (Sort Key) |
| --- | --- | --- |
| **Shop Metadata (ショップ情報)** | `SHOP#{shopId}` | `METADATA` |
| **Shop Product (商品情報)** | `SHOP#{shopId}` | `PRODUCT#{productId}` |
| **QR Metadata (QRコード及び注文ステータス)** | `QR#{uuid}` | `METADATA` |
| **QR Order (受取人入力の配送先情報)** | `QR#{uuid}` | `ORDER` |
| **QR Chat (チャット履歴)** | `QR#{uuid}` | `CHAT` |
| **User (ユーザー情報 ショップのオーナー・管理者)** | `USER#{userId}` | `SHOP` |
| **User (ユーザー情報 プレゼントを渡す人)** | `USER#{userId}` | `SENDER` |


---

## 2. 各データ構造の詳細（スキーマ）

### 2.1 Shop (ショップ情報)
ショップの基本情報とオーナー情報を保持します。現在はショップユーザーのメールアドレスがそのまま問い合わせ先となっています。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `SHOP#{shopId}` （`shopId` はUUID形式、例: `SHOP#123e4567-...`） |
| `SK` | String | 常に固定値 `METADATA` |
| `name` | String | ショップ名 （任意の文字列、例: `山田青果店`） |
| `detail_html` | String | ショップ説明 （任意のHTML文字列） |
| `email` | String | ショップの連絡先メールアドレス （例: `info@example.com`） |
| `owner_id` | String | オーナーのCognitoユーザーID （UUID形式の `sub` 属性） |
| `ts_created_at` | String | 作成日時 （ISO 8601形式のUTC日時文字列、例: `2024-03-01T12:00:00.000Z`） |
| `GSI2_PK` | String | `USER#{owner_id}` （オーナーのショップ一覧取得用、例: `USER#123e4567-...`） |
| `GSI2_SK` | String | 作成日時等ソートキー （ISO 8601形式のUTC日時文字列） |

### 2.2 Product (商品情報)
各ショップに紐づく商品カタログ情報です。

すでに有効化されたQRコードと紐づけられている商品などを変更すると混乱のもとになるため、基本的には作成した商品の変更操作は想定していません。また、同様の理由で、商品を削除する際には、statusがSTOPPED、かつすべての紐づけられたQRコードに対して発送されている必要があります(有効化済みでもなく発送待ちでもない)。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `SHOP#{shopId}` （`shopId` はUUID形式） |
| `SK` | String | `PRODUCT#{productId}` （`productId` はUUID形式） |
| `product_id` | String | 商品自身のUUID （逆引きや参照用） |
| `name` | String | 商品名 （任意の文字列、例: `高級メロン`） |
| `description` | String | 商品説明 （任意のシングルライン文字列） |
| `detail_html` | String | 商品説明 （任意のHTML文字列） |
| `image_url` | String | 商品画像のURL （署名付き等でアップロードされたS3への完全URLパス等） |
| `price` | Number | 価格 （0以上の正の数値） |
| `valid_days` | Number | QRコードの有効日数設定 （整数値、例: `90`, `180` など） |
| `status` | String | 商品の販売状態 (`ACTIVE`, `STOPPED`, または `DELETED`) ※詳細は2.6章 |
| `ts_created_at` | String | 作成日時 （ISO 8601形式のUTC日時文字列） |
| `GSI1_PK` | String | `PRODUCT#{status}` （アクティブな商品一覧取得用、例: `PRODUCT#ACTIVE`） |
| `GSI1_SK` | String | 作成日時等のソートキー （ISO 8601形式のUTC日時文字列） |
| `GSI2_PK` | String | `PRODUCT#{productId}` （UUIDからの逆引き用） |
| `GSI2_SK` | String | `SHOP#{productId}` (旧データ：作成日時等のソートキー （ISO 8601形式のUTC日時文字列）) |

### 2.3 QR Metadata (QRコード及び注文ステータス)
QRコードのライフサイクルや注文ステータス、商品との紐付けを管理します。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `QR#{uuid}` （QRコード自体が持つUUID形式の識別子） |
| `SK` | String | 常に固定値 `METADATA` |
| `pin` | String | 本人確認用の8桁のランダムな数字文字列 （例: `12345678`） |
| `status` | String | QRの進行状態 (`UNASSIGNED` 〜 `BANNED`) ※詳細は2.6章 |
| `shop_id` | String | 紐付け先のショップID （未連携時は存在しないか空） |
| `product_id` | String | 紐付け先の商品ID （未連携時は存在しないか空） |
| `batch_id` | String | QRコード生成時のバッチID（同じタイミングで生成されたQRは同じIDを持つ） |
| `memo_for_users` | String | ショップからの受取人向けメッセージ （任意の文字列） |
| `memo_for_shop` | String | ショップ自身の検索・管理用メモ欄 （任意の文字列） |
| `password_hash` | String | ユーザー設定の追加パスワードハッシュ値 (現在パスワード機能は無効化中) |
| `ts_activated_at` | String | 有効化日時 （ISO 8601形式のUTC日時文字列） |
| `ts_banned_at` | String | 無効化(BAN)日時 （ISO 8601形式のUTC日時文字列） |
| `ts_created_at` | String | QRバッチ一括生成日時 （ISO 8601形式のUTC日時文字列） |
| `ts_linked_at` | String | 商品を選択して紐付けた日時 （ISO 8601形式のUTC日時文字列） |
| `ts_submitted_at` | String | 受取人が配送先情報を送信した日時 （ISO 8601形式のUTC日時文字列） |
| `ts_shipped_at` | String | ショップが商品を発送した日時 （ISO 8601形式のUTC日時文字列） |
| `ts_completed_at` | String | 取引が完了した日時 （ISO 8601形式のUTC日時文字列） |
| `ts_expired_at` | String | 有効期限日時 （有効化日時に商品のvalid_daysを加算した日時） |
| `ts_updated_at` | String | レコードの最終変更日時 （ISO 8601形式のUTC日時文字列） |
| `GSI1_PK` | String | `QR#{status}` （ステータスごとの一覧取得用、例: `QR#ACTIVE`） |
| `GSI1_SK` | String | 作成日時等のソートキー （ISO 8601形式のUTC日時文字列） |
| `GSI2_PK` | String | `SHOP#{shopId}` （担当ショップが持つQR一覧取得用） |
| `GSI2_SK` | String | 作成日時等のソートキー （ISO 8601形式のUTC日時文字列） |

### 2.4 Order (受取人による配送先・注文詳細)
受取人が入力した配送先情報や、発送時の追跡番号などを保持します。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `QR#{uuid}` （関連するQRコードのUUID） |
| `SK` | String | 常に固定値 `ORDER` |
| `name` | String | 受取人氏名 （任意の文字列） |
| `address` | String | 配送先の完全な住所 （任意の文字列） |
| `zipCode` | String | 郵便番号 （例: `123-4567`、`1234567` 等書式チェックなしのため無効な文字列の可能性あり） |
| `preferredDate` | String | 配達希望日付 （YYYY-MM-DD形式等の文字列、指定なしの場合は空の可能性あり） |
| `preferredTime` | String | 配達希望時間帯 （システムで定義された時間帯区分の文字列） |
| `email` | String | 受取人の連絡先メールアドレス （`user@example.com` 等書式チェックなしのため無効な文字列の可能性あり） |
| `phone` | String | 受取人の電話番号 （例: `090-1234-5678` 等書式チェックなしのため無効な文字列の可能性あり） |
| `delivery_company` | String | 発送業者の名称/運送会社等 （ショップ側が発送時に任意の文字列を追記） |
| `tracking_number` | String | 荷物の伝票番号・追跡番号 （ショップ側が発送時に任意の文字列を追記） |
| `ts_shipped_at` | String | 発送完了処理が行われた日時 （ISO 8601形式のUTC日時文字列） |
| `ts_submitted_at` | String | 受取人がこのフォームを送信した日時 （ISO 8601形式のUTC日時文字列） |
| `ts_updated_at` | String | レコードの最終変更日時 （ISO 8601形式のUTC日時文字列） |

### 2.5 Chat (チャット履歴)
ショップと受取人間の連絡用チャットデータです。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `QR#{uuid}` （関連するQRコードのUUID） |
| `SK` | String | 常に固定値 `CHAT` |
| `messages` | Array | チャット本文の配列 （例: `[{ sender: "SHOP"\| "USER" \| "SYSTEM", content: "...", timestamp: "ISO時間" }]`） |
| `notification_emails` | StringSet | 新着通知の設定先メールリスト （購読を希望したユーザーのメールアドレス集合） |
| `email_preferences` | Map | メール通知の設定情報マップ （言語情報等、例: `{"user@example.com": "ja"}`） |
| `sender_info` | JSon | プレゼントを渡した人の名刺情報等（`detail_html` を含む）

### 2.6 User (ユーザー・権限情報)
ユーザーの基本情報と、管理・権限を持つショップのID一覧を保持します。ユーザーが最初にショップを作成した際、または既存のショップオーナーが初めてログインした際に自動生成されます。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `USER#{userId}` （`userId` はCognitoの `sub` 属性） |
| `SK` | String | 常に固定値 `SHOP` |
| `email` | String | ユーザーのメールアドレス |
| `roles` | Array | ユーザーに付与されたロールの配列 （例: `['SHOP_MANAGER', 'GENERAL_MANAGER']`） |
| `owner_shop_ids` | Array | 自身がオーナーであるショップID（`shopId`）の配列 |
| `gm_shop_ids` | Array | 管理権限（General Manager）を持つショップIDの配列 |
| `ts_created_at` | String | 作成日時 （ISO 8601形式のUTC日時文字列） |

### 2.7 レコードが保持可能な状態 (ステータス) 一覧


データベース内の `status` 属性が取りうる状態とその意味を定義します。

#### QR Metadata のステータス (`status`)
QRコードのライフサイクルや注文の進捗状況を表します。
![alt text](/documents/data/image-QRstatus.png)

- **`UNASSIGNED` (未連携)**
  QRコードが生成されましたが、まだショップや商品と紐付けられていません。
- **`LINKED` (連携済み)**
  ショップや商品と紐付けられましたが、まだ使用できるように有効化されていません。
- **`ACTIVE` (有効化済み)**
  有効化されており、ギフトとして贈ることができる状態です。
- **`USED` (発送待ち)**
  受取人が住所を入力し、発送待ちの状態です（ショップ側で発送作業が必要です）。
- **`SHIPPED` (発送済み)**
  ショップが商品を発送し、追跡番号が登録された状態です。
- **`COMPLETED` (受取り完了)**
  取引が正常に完了しました（受取人が受取完了報告を行った場合など）。
- **`EXPIRED` (期限切れ)**
  有効期限が切れ、ギフトが無効になった状態です。
- **`BANNED` (BAN済み)**
  不正利用などにより、システム管理者が利用停止させた状態です。

#### Product のステータス (`status`)
商品の販売・取り扱い状態を表します。

- **`ACTIVE` (販売中・有効)**
  ショップにて現在取り扱い中の商品であり、新しいQRコードに紐付けることが可能な状態です。
- **`STOPPED` (受注停止)**
  取り扱いを一時停止、または終了した商品です。新規のQRコードへの紐付け一覧には表示されなくなります（※既存の有効化済みQRや発送待ちのQRへの影響は生じません。商品を削除するには、その商品がSTOPPED状態で、紐づけられたすべてのQRコードがACTIVE・USED以外の顧客の手元にない状態である必要があります）。

---

## 3. 主なデータベース操作パターン (Lambda関数との対応)

1. **ショップ管理 (`shop-mgmt.ts`)**
   - ショップの作成: `PutCommand` (Shop)
   - ショップ一覧の取得: `QueryCommand` (GSI2 使用, Owner IDで絞り込み)
   - 商品の作成・更新・削除: `PutCommand`, `UpdateCommand`, `DeleteCommand` (Product)
   - QRコードの紐付け/有効化: `UpdateCommand` (QR Metadata)

2. **QR生成/管理者 (`admin-generate.ts` 等)**
   - QRコードの一括生成: `BatchWriteItemCommand` (QR Metadata を一括作成)

3. **受取人アクション (`recipient-submit.ts`, `recipient-verify-pin.ts`)**
   - PINコードの照合: `GetCommand` (QR Metadata)
   - 配送先情報の登録: `PutCommand` または `UpdateCommand` (Order および QR Metadataのステータス更新)

4. **注文管理/発送処理 (`shop-orders.ts`)**
   - 注文一覧の取得: `QueryCommand` (GSI2 使用で特定のショップのQR) + `BatchGetCommand` (対応するOrder情報を取得)
   - 発送ステータスへの更新: `UpdateCommand` (QR Metadata のステータスと、Order の追跡番号を更新)



