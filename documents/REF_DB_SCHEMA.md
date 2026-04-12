# データベース仕様および操作一覧

本プロジェクト（名刺がわりに）では、AWS CDKを使用して構築された **Amazon DynamoDB** (テーブル名: `MeishiGawariniTableV2`) のシングルテーブルデザインが採用されています。様々な種類のデータが、`PK` (パーティションキー) と `SK` (ソートキー)、および2つのGSI (グローバルセカンダリインデックス) を活用して一つのテーブルに格納されています。

以下に、データベース内に存在するデータの種類（エンティティ）と、各項目についての一覧表をまとめます。
論理的な関係性については [UML_DATA_STRUCTURE.md](./UML_DATA_STRUCTURE.md) を参照してください。


\# 使用しているデータテーブル内には古い規格のデータも含まれていますので、こことは異なる要素が含まれる可能性があります．

## 1. データの種類（エンティティ一覧）


| **エンティティ名 (詳細リンク)** | **PK (パーティションキー)** | **SK (ソートキー)** |
| :--- | :--- | :--- |
| **[User (ユーザー情報 ショップのオーナー・管理者)](#21-user-ユーザー権限情報)** | `USER#{user_id}` | `SHOP` |
| **[User (ユーザー情報 送り主プロフィール)](#22-user-ユーザー送り主プロフィール情報)** | `USER#{user_id}` | `SENDER` |
| **[User (ユーザー情報 配送先デフォルト)](#23-user-ユーザー配送先デフォルト情報)** | `USER#{user_id}` | `RECEIVER` |
| **[User (ユーザー履歴ログ)](#24-user-送信受信履歴ログ)** | `USER#{user_id}` | `SENDLOG#{index}` / `RECEIVEDLOG#{index}` |
| **[User (ユーザー履歴メタデータ)](#25-user-履歴管理用メタデータ)** | `USER#{user_id}` | `SENDLOG_META` / `RECEIVEDLOG_META` |
| **[Shop Metadata (ショップ情報)](#26-shop-ショップ情報)** | `SHOP#{shop_id}` | `METADATA` |
| **[Shop Product (商品情報)](#27-product-商品情報)** | `SHOP#{shop_id}` | `PRODUCT#{product_id}` |
| **[QR Metadata (QRコード及び注文ステータス)](#28-qr-metadata-qrコード及び注文ステータス)** | `QR#{uuid}` | `METADATA` |
| **[QR Order (受取人入力の配送先情報)](#29-order-受取人による配送先注文詳細)** | `QR#{uuid}` | `ORDER` |
| **[QR Chat (チャット履歴)](#210-chat-チャット履歴)** | `QR#{uuid}` | `CHAT` |
| **[Card Design (カードデザイン情報)](#211-card-design-metadata-カードデザイン)** | `CARD_DESIGN#METADATA` | `design_id` |
| **[Card Order (カード発注情報)](#212-card-order-カード発注情報)** | `CARD_ORDER#{shop_id}` | `ORDER#{order_id}` |
| **[QR Batch (一括生成バッチデータ)](#214-qr-batch-一括生成バッチデータ)** | `QR_BATCH#{batch_id}` | `METADATA#{ts_created_at}` |


---

## 2. 各データ構造の詳細（スキーマ）

### 2.1 User (ユーザー・権限情報)
ユーザーの基本情報と、管理・権限を持つショップのID一覧を保持します。ユーザーが最初にショップを作成した際、または既存のショップオーナーが初めてログインした際に自動生成されます。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `USER#{user_id}` （`user_id` はCognitoの `sub` 属性） |
| `SK` | String | 常に固定値 `SHOP` |
| `email` | String | ユーザーのメールアドレス |
| `roles` | Array | ユーザーに付与されたロールの配列 （例: `['SHOP_MANAGER', 'GENERAL_MANAGER']`） |
| `owner_shop_ids` | Array | 自身がオーナーであるショップID（[shop_id](#26-shop-ショップ情報)）の配列 |
| `gm_shop_ids` | Array | 管理権限（General Manager）を持つショップID（[shop_id](#26-shop-ショップ情報)）の配列 |
| `ts_created_at` | String | 作成日時 （ISO 8601形式のUTC日時文字列） |

### 2.2 User (ユーザー・送り主プロフィール情報)
プレゼントを渡す人（sender）が自己紹介として公開するプロフィール情報です。`/user/editprofile` 画面で自身のユーザーIDに紐付けて管理・再利用が可能です。また、`/receive` 画面で入力・保存（エクスポート）しても作成することができます。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `USER#{user_id}` （`user_id` はUUID形式の識別子、またはCognitoの `sub`） |
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
| `PK` | String | `USER#{user_id}` （Cognitoの `sub`） |
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
| `PK` | String | `USER#{user_id}` |
| `SK` | String | `SENDLOG#{index}` または `RECEIVEDLOG#{index}` (例: `001`) |
| `logs` | Array | 履歴データの配列。形式: `[{ qr_id: "ID", timestamp: "ISO時間" }]` ※旧データは `uuid` キーを使用 |
| `ts_updated_at` | String | レコードの最終更新日時 |

### 2.5 User (履歴管理用メタデータ)
履歴ログの書き込み位置や件数を管理するための内部データです。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `USER#{user_id}` |
| `SK` | String | `SENDLOG_META` または `RECEIVEDLOG_META` |
| `current_index` | Number | 現在書き込みを行っているログレコードのインデックス |
| `current_count` | Number | 現在のログレコードに含まれるエントリー数 |
| `ts_updated_at` | String | 最終更新日時 |

### 2.6 Shop (ショップ情報)
ショップの基本情報とオーナー情報を保持します。現在はショップユーザーのメールアドレスがそのまま問い合わせ先となっています。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `SHOP#{shop_id}` （`shop_id` はUUID形式、例: `SHOP#123e4567-...`） |
| `SK` | String | 常に固定値 `METADATA` |
| `name` | String | ショップ名 （任意の文字列、例: `山田青果店`） |
| `detail_html` | String | ショップ説明 （任意のHTML文字列） |
| `email` | String | ショップの連絡先メールアドレス （例: `info@example.com`） |
| `owner_id` | String | オーナーのCognitoユーザーID （[User](#21-user-ユーザー権限情報) の `sub` 属性） |
| `gm_ids` | Array<String> | マネージャーのCognitoユーザーIDのリスト （[User](#21-user-ユーザー権限情報) の `sub` 属性） |
| `card_designs` | Array<String> | ショップが利用可能な [カードデザインID](#211-card-design-metadata-カードデザイン) のリスト |
| `ts_created_at` | String | 作成日時 （ISO 8601形式のUTC日時文字列、例: `2024-03-01T12:00:00.000Z`） |
| `GSI2_PK` | String | `USER#{owner_id}` （オーナーのショップ一覧取得用、[User](#21-user-ユーザー権限情報) への逆引き用） |
| `GSI2_SK` | String | ソートキー。**オーナーID (`GSI2_PK`) が変更された際のみ**、現在時刻 (ISO 8601) に更新されます。 |
| `html_image_urls` | Array<String> | ショップ詳細HTML内で使用される画像のURL配列 |
| `card_designs` | Array<String> | ショップが利用可能なカードデザインIDのリスト |

### 2.7 Product (商品情報)
各ショップに紐づく商品カタログ情報です。

すでに有効化されたQRコードと紐づけられている商品などを削除すると使用期限内のカードが使えなくなるため、商品を削除する際には、statusがSTOPPED、かつすべての紐づけられたQRコードに対して発送されている必要があります(有効化済みでもなく発送待ちでもない)。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `SHOP#{shop_id}` （[ショップID](#26-shop-ショップ情報) はUUID形式） |
| `SK` | String | `PRODUCT#{product_id}` （`product_id` はUUID形式） |
| `product_id` | String | 商品自身のUUID （逆引きや参照用） |
| `name` | String | 商品名 （任意の文字列、例: `高級メロン`） |
| `description` | String | 商品説明 （任意のシングルライン文字列） |
| `detail_html` | String | 商品説明 （任意のHTML文字列） |
| `image_url` | String | 商品画像のURL （署名付き等でアップロードされたS3への完全URLパス等） |
| `price` | Number | 価格 （0以上の正の数値） |
| `valid_days` | Number | QRコードの有効日数設定 （整数値、例: `90`, `180` など） |
| `status` | String | 商品の販売状態 (`ACTIVE`, `STOPPED`, または `DELETED`) ※詳細は [2.15章](#215-レコードが保持可能な状態-ステータス-一覧) |
| `design_id` | String | [カードデザインID](#211-card-design-metadata-カードデザイン) （旧 `card_design_id`） |
| `ts_created_at` | String | 作成日時 （ISO 8601形式のUTC日時文字列） |
| `ts_updated_at` | String | 更新日時 （ISO 8601形式のUTC日時文字列） |
| `GSI1_PK` | String | `PRODUCT#{status}` （アクティブな商品一覧取得用、例: `PRODUCT#ACTIVE`） |
| `GSI1_SK` | String | ソートキー。**商品ステータス (`GSI1_PK`) が変更された際のみ**、現在時刻 (ISO 8601) に更新されます。 |
| `GSI2_PK` | String | `PRODUCT#{product_id}` （UUIDからの逆引き用） |
| `GSI2_SK` | String | ソートキー。商品作成時のみ現在時刻がセットされます（PKが不変のため）。 |

### 2.8 QR Metadata (QRコード及び注文ステータス)
QRコードのライフサイクルや注文ステータス、商品との紐付けを管理します。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `QR#{uuid}` （QRコード自体が持つUUID形式の識別子） |
| `SK` | String | 常に固定値 `METADATA` |
| `pin` | String | 本人確認用の8桁のランダムな数字文字列 （例: `12345678`） |
| `status` | String | QRの進行状態 (`UNASSIGNED` 〜 `BANNED`) ※詳細は [2.15章](#215-レコードが保持可能な状態-ステータス-一覧) |
| `shop_id` | String | 紐付け先の [ショップID](#26-shop-ショップ情報) （未連携時は存在しないか空） |
| `product_id` | String | 紐付け先の [商品ID](#27-product-商品情報) （未連携時は存在しないか空） |
| `batch_id` | String | QRコード生成時の [バッチID](#214-qr-batch-一括生成バッチデータ) |
| `owner_id` | String | (QR生成時オプション) 会員限定QR用 [User ID](#21-user-ユーザー権限情報) （UUID形式の `sub`） |
| `design_id` | String | [カードデザインID](#211-card-design-metadata-カードデザイン) （旧 `card_design`） |
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
| `receiver_user_id` | String | (受取時自動記録) 受取完了時にログインしていた [受取人の User ID](#21-user-ユーザー権限情報) |
| `failed_attempts` | Number | (受取用PIN入力制限) 認証失敗回数。一定回数でロックされます。 |
| `locked_until` | String | (受取用PIN入力制限) ロック解除日時 （ISO 8601形式のUTC日時文字列） |
| `ban_reason` | String | 無効化(BAN)理由 （任意の文字列） |
| `GSI1_PK` | String | `QR#{status}` （ステータスごとの一覧取得用、例: `QR#ACTIVE`） |
| `GSI1_SK` | String | ソートキー。**ステータス (`GSI1_PK`) が変更された際のみ**、現在時刻 (ISO 8601) に更新されます。 |
| `GSI2_PK` | String | `SHOP#{shop_id}` （担当ショップが持つQR一覧取得用） |
| `GSI2_SK` | String | ソートキー。**紐付け先ショップ (`GSI2_PK`) が変更された際のみ**、現在時刻 (ISO 8601) に更新されます。 |

### 2.9 Order (受取人による配送先・注文詳細)
受取人が入力した配送先情報や、発送時の追跡番号などを保持します。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `QR#{uuid}` （関連するQRコードのUUID） |
| `SK` | String | 常に固定値 `ORDER` |
| `name` | String | 受取人氏名 （任意の文字列） |
| `address` | String | 配送先の完全な住所 （任意の文字列） |
| `zip_code` | String | 郵便番号 （例: `123-4567`、`1234567` 等。書式チェックなしのため無効な文字列の可能性あり） ※以前は `zipCode` として保存されていた可能性があります。 |
| `preferred_date` | String | 配達希望日付 （YYYY-MM-DD形式等の文字列、指定なしの場合は空の可能性あり） ※以前は `preferredDate` として保存されていた可能性があります。 |
| `preferred_time` | String | 配達希望時間帯 （システムで定義された時間帯区分の文字列） ※以前は `preferredTime` として保存されていた可能性があります。 |
| `email` | String | 受取人の連絡先メールアドレス （`user@example.com` 等書式チェックなしのため無効な文字列の可能性あり） |
| `phone` | String | 受取人の電話番号 （例: `090-1234-5678` 等書式チェックなしのため無効な文字列の可能性あり） |
| `delivery_company` | String | 発送業者の名称/運送会社等 （ショップ側が発送時に任意の文字列を追記） |
| `tracking_number` | String | 荷物の伝票番号・追跡番号 （ショップ側が発送時に任意の文字列を追記） |
| `ts_shipped_at` | String | 発送完了処理が行われた日時 （ISO 8601形式のUTC日時文字列） |
| `receiver_user_id` | String | (受取時自動記録) 受取完了時にログインしていた [受取人の User ID](#21-user-ユーザー権限情報) |
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
| `sender_info` | JSon | プレゼントを渡した人の名刺情報等（[User SENDER](#22-user-ユーザー送り主プロフィール情報) のスナップショット） |
| `sender_id` | String | (QR生成時オプション) プレゼントを渡した [ユーザーのID](#21-user-ユーザー権限情報) |
| `total_size_bytes` | Number | チャットに添付されたファイルの累計サイズ (100MB制限用) |
| `messages` | Array<Object> | メッセージ履歴。形式: `[{ id, role, username, message, type, file_url, file_size, ts_created_at }]` |


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
| `PK` | String | `CARD_ORDER#SHOP{shop_id}` または `CARD_ORDER#ADMIN{user_id}` |
| `SK` | String | `ORDER#{order_id}` （`order_id` はUUID形式） |
| `order_id` | String | 発注ID （UUID形式） |
| `quantity` | Number | 発注枚数（上限100枚） |
| `status` | String | 発注状態 (`ORDERED`, `CANCELLED`, `PRINTING`, `SHIPPED`, `COMPLETED`, `REJECTED`) |
| `design_id` | String | [デザインID](#211-card-design-metadata-カードデザイン) （UUID形式） |
| `product_id` | String | (オプション・制限) [商品ID](#27-product-商品情報) （UUID形式） |
| `shop_id` | String | (オプション・制限) [ショップID](#26-shop-ショップ情報) （UUID形式） |
| `shop_user_id` | String | (オプション・制限) [User ID](#21-user-ユーザー権限情報) （閲覧制限用） |
| `sender_user_id` | String | (オプション・制限) [User ID](#21-user-ユーザー権限情報) （送り主固定用） |
| `expiration_date` | String | (オプション・制限) 使用期限 （ISO 8601形式のUTC日時文字列） |
| `activate_now` | Boolean | (オプション・制限) 生成と同時に有効化するか |
| `ts_created_at` | String | 作成日時 （ISO 8601形式のUTC日時文字列） |
| `ts_updated_at` | String | 更新日時 （ISO 8601形式のUTC日時文字列） |
| `ts_qr_generated_at` | String | QRコード生成日時 （ISO 8601形式のUTC日時文字列） |
| `user_id_order` | String | 発注を申請した [ユーザーのID](#21-user-ユーザー権限情報) |
| `user_id_create` | String | 実際に処理を行った [管理者のID](#21-user-ユーザー権限情報) |
| `batch_id` | String | 生成されたQRコード群の [バッチID](#214-qr-batch-一括生成バッチデータ) |
| `GSI1_PK` | String | `CARD_ORDER#{status}` （アクティブな商品一覧取得用） |
| `GSI1_SK` | String | ソートキー |
| `GSI2_PK` | String | `CARD_ORDER#{order_id}` （逆引き用） |
| `GSI2_SK` | String | ソートキー |

### 2.14 QR Batch (一括生成バッチデータ)
QRコードを一括生成した際のメタデータと、生成された全QRコードのペア（IDとPIN）を保持します。PDF/CSVの再生成や、一括管理に使用されます。

| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` | String | `QR_BATCH#{batch_id}` |
| `SK` | String | `METADATA#{ts_created_at}` |
| `data` | Array | 生成されたQRコードのリスト。形式: `[{ qr_id: "...", pin: "..." }]` |
| `order_id` | String | このバッチ生成の契機となった [カード発注ID](#212-card-order-カード発注情報) |
| `ts_created_at` | String | 作成日時 |

### 2.15 各エンティティのステータス定義
QRコードや商品のライフサイクルにおけるステータスの詳細定義については、以下のドキュメントを参照してください。

👉 **[運用フロー: ステータスのライフサイクル定義](./ATFIRST_OPERATION_FLOW.md#6-ステータスのライフサイクル定義)**

---

## 3. API・Lambda関数とDB操作の対応
どのAPI（Lambda関数）がどのようなDB操作（Get, Put, Query, Update等）を実行しているかのマッピングについては、以下のドキュメントを参照してください。

👉 **[管理者・ショップ・受取人用API一覧 (REF_API_ENDPOINTS.md)](./REF_API_ENDPOINTS.md)**
   - 「DB操作 (Commands)」列に各エンドポイントの主要なDB操作を網羅しています。

---

## 4. 関連ドキュメント (Related Documentation)

- **[UML_DATA_STRUCTURE.md](./UML_DATA_STRUCTURE.md)**  
  エンティティ間の論理的な関係性（Role-Based）を可視化したUMLクラス図・ER図。
- **[SPEC_INFRA_DYNAMODB.md](./SPEC_INFRA_DYNAMODB.md)**  
  DynamoDBシングルテーブル設計の基本概念、インデックス活用の詳細、および設計思想。
- **[REF_API_ENDPOINTS.md](./REF_API_ENDPOINTS.md)**  
  各Lambda関数が利用するAPIエンドポイント、リクエストパラメータ、およびレスポンス形式の詳細。
