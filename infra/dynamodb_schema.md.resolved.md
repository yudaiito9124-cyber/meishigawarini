# DynamoDB Data Models Template

このアプリケーションで使用されているDynamoDBのデータモデル定義です。
`PK` と `SK` の組み合わせでアイテムの種類を識別します。

---

## 1. QRコード (QR Code)

### 基本情報 (Metadata)
QRコードの現在の状態や紐付け情報を管理します。

| Attribute | Type | Example | Description |
| :--- | :--- | :--- | :--- |
| **PK** | String | `QR#<uuid>` | パーティションキー |
| **SK** | String | `METADATA` | ソートキー |
| **status** | String | `UNASSIGNED` \| `LINKED` \| `ACTIVE` \| `USED` \| `SHIPPED` | 現在のステータス |
| **pin** | String | `1234` | 認証用PINコード |
| **shop_id** | String | `<shop_uuid>` | (LINKED以降) 紐付いたショップID |
| **product_id** | String | `<product_uuid>` | (LINKED以降) 紐付いた商品ID |
| **ts_created_at** | ISO8601 | `2024-01-01T00:00:00Z` | 作成日時 |
| **ts_activated_at** | ISO8601 | `2024-01-02T00:00:00Z` | (ACTIVE以降) 有効化日時 |
| **ts_shipped_at** | ISO8601 | `2024-01-03T00:00:00Z` | (SHIPPEDのみ) 発送日時 |
| **GSI1_PK** | String | `QR#UNASSIGNED` | **検索用インデックス** (ステータス別) |
| **GSI1_SK** | String | `2024-01-01T00:00:00Z` | **検索用ソートキー** (作成日時順) |

### 注文情報 (Order)
受取人が住所を入力した後に作成される、発送先情報のレコードです。

| Attribute | Type | Example | Description |
| :--- | :--- | :--- | :--- |
| **PK** | String | `QR#<uuid>` | 親のQRコードと同じPK |
| **SK** | String | `ORDER` | ソートキー |
| **name** | String | `山田 太郎` | 受取人名 |
| **postal_code** | String | `100-0001` | 郵便番号 |
| **address** | String | `東京都千代田区...` | 住所 |
| **phone** | String | `090-1234-5678` | 電話番号 |
| **email** | String | `taro@example.com` | メールアドレス |
| **tracking_number**| String | `123456789012` | (SHIPPEDのみ) 追跡番号 |
| **ts_submitted_at** | ISO8601 | `2024-01-02T12:00:00Z` | 注文確定日時 |

---

## 2. ショップ (Shop)

### 基本情報 (Metadata)

| Attribute | Type | Example | Description |
| :--- | :--- | :--- | :--- |
| **PK** | String | `SHOP#<shop_uuid>` | パーティションキー |
| **SK** | String | `METADATA` | ソートキー |
| **name** | String | `My Cookie Shop` | ショップ名 |
| **owner_id** | String | `<cognito_sub>` | オーナーのユーザーID (Cognito) |
| **ts_created_at** | ISO8601 | `2024-01-01T00:00:00Z` | 作成日時 |

---

## 3. 商品 (Product)

ショップに登録されている商品の情報です。

| Attribute | Type | Example | Description |
| :--- | :--- | :--- | :--- |
| **PK** | String | `SHOP#<shop_uuid>` | 親のショップと同じPK |
| **SK** | String | `PRODUCT#<product_uuid>` | ソートキー |
| **product_id** | String | `<product_uuid>` | 商品ID (SKから抽出も可だが便宜上保持) |
| **name** | String | `Assorted Cookies` | 商品名 |
| **description** | String | `Delicious cookies...` | 商品説明 |
| **price** | Number | `1000` | 価格 |
| **image_url** | String | `https://s3...` | 商品画像URL |
| **status** | String | `ACTIVE` \| `STOPPED` | 販売ステータス |
| **GSI1_PK** | String | `PRODUCT#ACTIVE` | **検索用インデックス** (ステータス別) |
| **GSI1_SK** | String | `2024-01-01T00:00:00Z` | **検索用ソートキー** (作成日時順) |
