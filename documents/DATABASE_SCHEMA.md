# データベース仕様および操作一覧

本プロジェクト（名刺がわりに）では、AWS CDKを使用して構築された **Amazon DynamoDB** (テーブル名: `MeishiGawariniTableV2`) のシングルテーブルデザインが採用されています。様々な種類のデータが、`PK` (パーティションキー) と `SK` (ソートキー)、および2つのGSI (グローバルセカンダリインデックス) を活用して一つのテーブルに格納されています。

以下に、データベース内に存在するデータの種類（エンティティ）と、各項目についての一覧表をまとめます。

\# 使用しているデータテーブル内には古い規格のデータも含まれていますので、こことは異なる要素が含まれる可能性があります．

## 1. データの種類（エンティティ一覧）

| **User (ユーザー情報 ショップのオーナー・管理者)** | `USER#{userId}` | `SHOP` |
| **User (ユーザー情報 送り主プロフィール)** | `USER#{userId}` | `SENDER` |
| **User (ユーザー情報 配送先デフォルト)** | `USER#{userId}` | `RECEIVER` |
| **User (ユーザー履歴ログ)** | `USER#{userId}` | `SENDLOG#{index}` / `RECEIVEDLOG#{index}` |
| **User (ユーザー履歴メタデータ)** | `USER#{userId}` | `SENDLOG_META` / `RECEIVEDLOG_META` |
| **Shop Metadata (ショップ情報)** | `SHOP#{shopId}` | `METADATA` |
| **Shop Product (商品情報)** | `SHOP#{shopId}` | `PRODUCT#{productId}` |
| **QR Metadata (QRコード及び注文ステータス)** | `QR#{uuid}` | `METADATA` |
| **QR Order (受取人入力の配送先情報)** | `QR#{uuid}` | `ORDER` |
| **QR Chat (チャット履歴)** | `QR#{uuid}` | `CHAT` |
| **Card Design (カードデザイン情報)** | `CARD_DESIGN#METADATA` | `designId` |
| **Card Order (カード発注情報)** | `CARD_ORDER#{shopId}` | `ORDER#{orderId}` |


---

## 2. 各データ構造の詳細（スキーマ）

### 2.1 User (ユーザー・権限情報)
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

### 2.2 User (ユーザー・送り主プロフィール情報)
プレゼントを渡す人（sender）が自己紹介として公開するプロフィール情報です。`/receive` 画面で入力・保存（エクスポート）すると作成され、自身のユーザーIDに紐付けて管理・再利用が可能です。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `USER#{userId}` （`userId` はUUID形式の識別子、またはCognitoの `sub`） |
| `SK` | String | 常に固定値 `SENDER` |
| `name` | String | 名前 |
| `job_title` | String | 役職 |
| `company` | String | 会社名 |
| `department` | String | 部署名 |
| `email` | String | 連絡先メールアドレス |
| `phone` | String | 代表電話番号 |
| `phone_direct` | String | 直通・携帯電話番号 |
| `address` | String | 住所 |
| `HP` | String | ウェブサイトURL |
| `url` | String | その他関連URL |
| `tags` | String/Array | 関連タグ情報 |
| `memo` | String | 自由記述メモ |
| `others` | String | その他情報（誕生日、血液型など） |
| `exchange_date` | String | 名刺交換日等 |
| `detail_html` | String | 詳細紹介用HTMLコンテンツ |
| `card_image_url` | String | 名刺・プロフィール画像のURL |
| `card_image_name` | String | 名刺・プロフィール画像のファイル名 |
| `html_image_urls` | Array<String> | HTML内で使用される画像のURL配列 |
| `import_id` | String | (システム用) インポート元のID |
| `Service_Eight` | String | EightサービスURL |
| `Service_Linktree` | String | LinktreeサービスURL |
| `SNS_Facebook` | String | FacebookプロファイルURL |
| `SNS_Instagram` | String | InstagramプロファイルURL |
| `SNS_LINE` | String | LINEプロファイルURL |
| `SNS_Threads` | String | ThreadsプロファイルURL |
| `SNS_TikTok` | String | TikTokプロファイルURL |
| `SNS_X` | String | X (Twitter) プロファイルURL |
| `SNS_YouTube` | String | YouTubeプロファイルURL |
| `ts_created_at` | String | 作成日時 (ISO 8601) |
| `ts_updated_at` | String | 更新日時 (ISO 8601) |

### 2.3 User (ユーザー・配送先デフォルト情報)
受取人がギフトを受け取る際、配送先フォームに自動入力されるデフォルト情報です。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `USER#{userId}` （Cognitoの `sub`） |
| `SK` | String | 常に固定値 `RECEIVER` |
| `name` | String | 受取人氏名 |
| `zipCode` | String | 郵便番号 |
| `address` | String | 配送先住所 |
| `phone` | String | 電話番号 |
| `email` | String | 連絡先メールアドレス |
| `ts_created_at` | String | 作成日時 (ISO 8601) |
| `ts_updated_at` | String | 更新日時 (ISO 8601) |

### 2.4 User (送信・受信履歴ログ)
ユーザーがいつ、どのギフト（QRコード）を送ったか、または受け取ったかの履歴を保持します。1レコードあたり最大1000件ずつ格納されます。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `USER#{userId}` |
| `SK` | String | `SENDLOG#{index}` または `RECEIVEDLOG#{index}` (例: `001`) |
| `logs` | Array | 履歴データの配列。形式: `[{ uuid: "QRのUUID", timestamp: "ISO時間" }]` |
| `ts_updated_at` | String | レコードの最終更新日時 |

### 2.5 User (履歴管理用メタデータ)
履歴ログの書き込み位置や件数を管理するための内部データです。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `USER#{userId}` |
| `SK` | String | `SENDLOG_META` または `RECEIVEDLOG_META` |
| `current_index` | Number | 現在書き込みを行っているログレコードのインデックス |
| `current_count` | Number | 現在のログレコードに含まれるエントリー数 |
| `ts_updated_at` | String | 最終更新日時 |

### 2.6 Shop (ショップ情報)
ショップの基本情報とオーナー情報を保持します。現在はショップユーザーのメールアドレスがそのまま問い合わせ先となっています。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `SHOP#{shopId}` （`shopId` はUUID形式、例: `SHOP#123e4567-...`） |
| `SK` | String | 常に固定値 `METADATA` |
| `name` | String | ショップ名 （任意の文字列、例: `山田青果店`） |
| `detail_html` | String | ショップ説明 （任意のHTML文字列） |
| `email` | String | ショップの連絡先メールアドレス （例: `info@example.com`） |
| `owner_id` | String | オーナーのCognitoユーザーID （UUID形式の `sub` 属性） |
| `gm_ids` | Array<String> | マネージャーのCognitoユーザーIDのリスト （UUID形式の `sub` 属性） |
| `card_designs` | Array<String> | ショップが利用可能なカードデザインIDのリスト |
| `ts_created_at` | String | 作成日時 （ISO 8601形式のUTC日時文字列、例: `2024-03-01T12:00:00.000Z`） |
| `GSI2_PK` | String | `USER#{owner_id}` （オーナーのショップ一覧取得用、例: `USER#123e4567-...`） |
| `GSI2_SK` | String | 作成日時等ソートキー （ISO 8601形式のUTC日時文字列） |

### 2.7 Product (商品情報)
各ショップに紐づく商品カタログ情報です。

すでに有効化されたQRコードと紐づけられている商品などを削除すると使用期限内のカードが使えなくなるため、商品を削除する際には、statusがSTOPPED、かつすべての紐づけられたQRコードに対して発送されている必要があります(有効化済みでもなく発送待ちでもない)。

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
| `ts_updated_at` | String | 更新日時 （ISO 8601形式のUTC日時文字列） |
| `GSI1_PK` | String | `PRODUCT#{status}` （アクティブな商品一覧取得用、例: `PRODUCT#ACTIVE`） |
| `GSI1_SK` | String | 作成日時等のソートキー （ISO 8601形式のUTC日時文字列） |
| `GSI2_PK` | String | `PRODUCT#{productId}` （UUIDからの逆引き用） |
| `GSI2_SK` | String | `SHOP#{productId}` (旧データ：作成日時等のソートキー （ISO 8601形式のUTC日時文字列）) |

### 2.8 QR Metadata (QRコード及び注文ステータス)
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
| `owner_id` | String | (QR生成時オプション)QRコードを扱えるショップの制限用、ユーザーID(そのユーザーがshop/画面で見れるショップに制限) （UUID形式の `sub` 属性） |
| `memo_for_users` | String | ショップからの受取人向けメッセージ （任意の文字列） |
| `memo_for_shop` | String | ショップ自身の検索・管理用メモ欄 （任意の文字列） |
| `password_hash` | String | ユーザー設定の追加パスワードハッシュ値 (現在パスワード機能は設定画面をコメントアウトして無効化中) |
| `ts_activated_at` | String | 有効化日時 （ISO 8601形式のUTC日時文字列） |
| `ts_banned_at` | String | 無効化(BAN)日時 （ISO 8601形式のUTC日時文字列） |
| `ts_created_at` | String | QRバッチ一括生成日時 （ISO 8601形式のUTC日時文字列） |
| `ts_linked_at` | String | 商品を選択して紐付けた日時 （ISO 8601形式のUTC日時文字列） |
| `ts_submitted_at` | String | 受取人が配送先情報を送信した日時 （ISO 8601形式のUTC日時文字列） |
| `ts_shipped_at` | String | ショップが商品を発送した日時 （ISO 8601形式のUTC日時文字列） |
| `ts_completed_at` | String | 取引が完了した日時 （ISO 8601形式のUTC日時文字列） |
| `ts_expired_at` | String | 有効期限日時 （有効化日時に商品のvalid_daysを加算した日時） |
| `ts_updated_at` | String | レコードの最終変更日時 （ISO 8601形式のUTC日時文字列） |
| `ban_reason` | String | 無効化(BAN)理由 （任意の文字列） |
| `GSI1_PK` | String | `QR#{status}` （ステータスごとの一覧取得用、例: `QR#ACTIVE`） |
| `GSI1_SK` | String | 作成日時等のソートキー （ISO 8601形式のUTC日時文字列） |
| `GSI2_PK` | String | `SHOP#{shopId}` （担当ショップが持つQR一覧取得用） |
| `GSI2_SK` | String | 作成日時等のソートキー （ISO 8601形式のUTC日時文字列） |

### 2.9 Order (受取人による配送先・注文詳細)
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

### 2.10 Chat (チャット履歴)
ショップと受取人間の連絡用チャットデータです。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `QR#{uuid}` （関連するQRコードのUUID） |
| `SK` | String | 常に固定値 `CHAT` |
| `messages` | Array | チャット本文の配列 （例: `[{ sender: "SHOP"\| "USER" \| "SYSTEM", content: "...", timestamp: "ISO時間" }]`） |
| `notification_emails` | StringSet | 新着通知の設定先メールリスト （購読を希望したユーザーのメールアドレス集合） |
| `email_preferences` | Map | メール通知の設定情報マップ （言語情報等、例: `{"user@example.com": "ja"}`） |
| `sender_info` | JSon | プレゼントを渡した人の名刺情報等（`detail_html` を含む）
| `sender_id` | String | (QR生成時オプション) プレゼントを渡したユーザーのID(receiveの送り主情報入力画面でexportすると保存される使いまわし専用ID、これがあるとreceive画面の送り主情報は編集不可能) |
### 2.11 Card Design Metadata (カードデザイン)
カードのデザイン（背景画像、QR・PIN・UUIDの配置等）を保持します。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | 常に固定値 `CARD_DESIGN#METADATA` |
| `SK` | String | デザインID (例: `20240317...`) |
| `design_id` | String | デザインID (SKと同じ値) |
| `name` | String | デザイン名 |
| `description` | String | 説明 |
| `bgimgf` | String | 表面背景画像URL (S3) |
| `bgimgb` | String | 裏面背景画像URL (S3) |
| `thumbf` | String | 表面サムネイル画像URL (WebP, S3) |
| `thumbb` | String | 裏面サムネイル画像URL (WebP, S3) |
| `width` | Number | カード幅 (mm, デフォルト 84) |
| `height` | Number | カード高さ (mm, デフォルト 52) |
| `qrsize` | Number | QRコードサイズ (mm) |
| `qrpos` | Map | QR位置 `{x: Number, y: Number}` |
| `pinsize` | Number | PIN文字サイズ |
| `pinpos` | Map | PIN位置 `{x: Number, y: Number}` |
| `codesize` | Number | UUID文字サイズ |
| `codepos` | Map | UUID位置 `{x: Number, y: Number}` |
| `isfront_qr` | Boolean | QRを表面に配置するか |
| `isfront_pin` | Boolean | PINを表面に配置するか |
| `isfront_code` | Boolean | UUIDを表面に配置するか |
| `ts_created_at` | String | 作成日時 |
| `ts_updated_at` | String | 更新日時 |

---
### 2.12 Card Order (カード発注情報)
各ショップに紐づくカード発注情報です。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `CARD_ORDER#SHOP{shopId}` （`shopId` はUUID形式,いずれSHOP以外も？） |
| `SK` | String | `ORDER#{orderId}` （`orderId` はUUID形式） |
| `order_id` | String | 発注ID （UUID形式） |
| `quantity` | Number | 発注枚数 |
| `status` | String | 発注状態 (`ORDERED`, `CANCELLED`, `PRINTING`, `SHIPPED`, `COMPLETED`, `REJECTED`) | ショップからはORDEREDの時点でのみCANCELLEDに移行可能，システム管理者が生成した時点でPRINTINGに移行 |
| `design_id` | String | デザインID （UUID形式） |
| `product_id` | String | (オプション・制限) 商品ID （UUID形式） |
| `shop_id` | String | (オプション・制限) ショップID （UUID形式） |
| `shop_user_id` | String | (オプション・制限) そのユーザーIDが閲覧できるショップに限定 （UUID形式） |
| `sender_user_id` | String | (オプション・制限) そのユーザーIDを送り主に設定 （UUID形式） |
| `expiration_date` | String | (オプション・制限) 使用期限 （ISO 8601形式のUTC日時文字列） |
| `activate_now` | Boolean | (オプション・制限) 生成と同時に有効化するか |
| `ts_created_at` | String | 作成日時 （ISO 8601形式のUTC日時文字列） |
| `ts_updated_at` | String | 更新日時 （ISO 8601形式のUTC日時文字列） |
| `GSI1_PK` | String | `CARD_ORDER#{status}` （アクティブな商品一覧取得用、例: `CARD_ORDER#ORDERED`） |
| `GSI1_SK` | String | 作成日時等のソートキー （ISO 8601形式のUTC日時文字列） |
| `GSI2_PK` | String | `CARD_ORDER#{orderId}` （UUIDからの逆引き用） |
| `GSI2_SK` | String | `SHOP#{orderId}` (旧データ：作成日時等のソートキー （ISO 8601形式のUTC日時文字列）) |
 欲しい？　印刷したユーザー名，手動で生成した場合もこのフォーマットでレコードを残す？

### 2.13 レコードが保持可能な状態 (ステータス) 一覧


データベース内の `status` 属性が取りうる状態とその意味を定義します。

#### QR Metadata のステータス (`status`)
QRコードのライフサイクルや注文の進捗状況を表します。
![alt text](/documents/data/image-QRstatus.webp)

- **`UNASSIGNED` (未連携)**
  QRコードが生成されましたが、まだショップや商品と紐付けられていません。
- **`LINKED` (連携済み)**
  ショップや商品と紐付けられましたが、まだ使用できるように有効化されていません。(すぐに有効化できる状態、少なくともショップと商品が紐づいている)
- **`ACTIVE` (有効化済み)**
  有効化されており、ギフトとして贈ることができる状態です。
- **`PROMOTION` (プロモーション)**
  プロモーション用のギフトとして設定されている状態です。
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

1. **ショップ管理 (`shop_create.ts`, `shop_list.ts`, `shop_details.ts`)**
   - ショップの作成: `PutCommand` (Shop Metadata)
   - ショップ一覧の取得: `GetCommand` (User Shop) + `BatchGetCommand` (Shop Metadata)
   - ショップ詳細の取得・更新: `GetCommand`, `UpdateCommand` (Shop Metadata)

2. **商品管理 (`shop_products.ts`, `shop_products_import.ts`, `shop_products_uploadurl.ts`)**
   - 商品のCRUD操作: `PutCommand`, `UpdateCommand`, `DeleteCommand`, `QueryCommand` (Product)
   - 商品のインポート: `GetCommand` (Source Product) + `PutCommand` (Target Product)
   - 画像アップロードURL発行: (S3 Presigned URL発行)

3. **QR管理 (`shop_qr.ts`, `admin-generate.ts`)**
   - QRコードの一括生成: `BatchWriteItemCommand` (QR Metadata)
   - QRコードの一覧・検索: `QueryCommand` (GSI2 使用)
   - QRコードの紐付け・有効化: `UpdateCommand` (QR Metadata)
   - QR状態チェック: `GetCommand` (QR Metadata)

4. **注文管理/発送処理 (`shop_orders.ts`)**
   - 注文一覧の取得: `QueryCommand` (GSI2 使用で特定のショップのQR) + `BatchGetCommand` (対応するOrder情報を取得)
   - 発送ステータスへの更新: `UpdateCommand` (QR Metadata のステータスと、Order の追跡番号を更新)

5. **受取人アクション (`receive_verify.ts`, `receive_submit.ts`, `receive_completed.ts`)**
   - PINコードの照合・メタデータ取得: `GetCommand` (QR Metadata)
   - 配送先情報の登録: `PutCommand` (Order) + `UpdateCommand` (QR Metadata ステータス更新)
   - 受取完了報告: `UpdateCommand` (QR Metadata)

6. **チャット/送り主管理 (`receive_chat.ts`, `receive_sender.ts`)**
   - チャット履歴の取得・追加: `GetCommand`, `UpdateCommand` (Chat)
   - 送り主プロフィールの読込・保存: `GetCommand`, `PutCommand` (User SENDER)



