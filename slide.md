---
marp: true
theme: default
paginate: true
size: 16:9
header: '"名刺代わりに" 開発説明'
style: |
  section { font-size: 24px; padding: 40px; }
  h1 { font-size: 40px; color: #2c3e50; margin-bottom: 20px; }
  h2 { font-size: 30px; color: #34495e; border-bottom: 2px solid #bdc3c7; padding-bottom: 5px; margin-bottom: 15px; }
  ul { margin-bottom: 10px; line-height: 1.35; }
  li { margin-bottom: 5px; }
  table { font-size: 16px; width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #bdc3c7; padding: 4px; }
  th { background-color: #ecf0f1; }
---

# 「名刺代わりに」 開発資料

詳細仕様・システムアーキテクチャ・運用ガイド体系化資料
(詳細はdocumentのmdファイルを参考)

---

## プロジェクトの全体コンセプト

- 物理的なQRコードを用いたギフト・商品贈受システム
- ユーザー体験 (UX) のシームレス化
  - 物理カードのQRからWebへ誘導し、商品の確認から配送先入力まで完結
- システム利用者の3分類と役割
  1. 受取人 (エンドユーザー): QR読取、PIN入力によるギフト要求・受領
  2. ショップ管理者: 商品カタログ登録、QRと商品の紐付け、注文・発送管理
  3. システム管理者: 権限グループ所属者。基盤管理とQR一括生成・監視
- インフラアーキテクチャの基本方針
  - AWSマネージドサービスを連携した完全サーバーレス構成

---

## アプリケーション・インフラ構成

- `frontend/` ディレクトリ (画面側)
  - Next.js (App Router, React 19), Tailwind CSS, Shadcn/ui
  - AWS Amplifyによる自動ホスティング（`main` ブランチPUSH連動）
  - 動的ルーティング (`/[locale]/`) による言語切り替え機能
- `infra/` ディレクトリ (バックエンド側)
  - AWS CDK v2 (TypeScript) による Infrastructure as Code
  - AWS Lambda: 機能ごとに細分化されたAPIロジック本体 (`infra/lambda/`)
  - Amazon API Gateway: HTTPリクエストのエンドポイント・ルーティング
  - Amazon DynamoDB: シングルテーブル設計によるフルマネージドNoSQL
  - Amazon Cognito: IAM連携によるユーザー認証および権限(Group)管理
  - Amazon S3: 商品画像等のアップロード用ストレージ

---

## DB設計: DynamoDB シングルテーブル設計

- 採用する唯一のテーブル: `MeishiGawariniTableV2`
- テーブル統合の概念（単一テーブル）
  - ショップ情報、商品、QR状態、注文などの異なる性質のデータを混在
  - メリット: 大量アクセスへの耐性と、最速・最安のパフォーマンス
- カギ（キー）の組み合わせによる特定
  - PK (Partition Key): データが入っている「大きな箱」の名前
  - SK (Sort Key): 箱の中にある「個々の書類」の名前
- クエリの効率化
  - 1回の検索（同一PKへのアクセス）で、親データと関連の全子データを一括取得可能

---

## DynamoDBのGSI（グローバルセカンダリインデックス）とは

- GSIの概念と目的
  - PKとSKでしか検索できないというDynamoDBの特性を補う「裏口」
  - メインの箱（PK）以外の、別の切り口や条件でデータを素早く集めるための仕組み
- システム要件への対応
  - 「自分がオーナーの全ショップを見たい」「未発送のQR一覧を見たい」などの横断的検索
- インデックスキーの設定
  - GSI専用のPKとSK（本システムでは `GSI1_PK`, `GSI1_SK`, `GSI2_PK`, `GSI2_SK`）をレコードに別途コピー保存して検索軸を提供

---

## バックエンド実装解説1: DynamoDBとGSIのCDK構成

- シングルテーブル (`MeishiGawariniTableV2`) の生成とGSI（検索用裏口）の定義

```typescript
const table = new dynamodb.Table(this, 'MeishiGawariniTableV2', {
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // サーバレス課金(従量制)
});
// 状態等で検索するための検索用裏口(GSI)の定義
table.addGlobalSecondaryIndex({
  indexName: 'GSI1', // ステータス検索用
  partitionKey: { name: 'GSI1_PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'GSI1_SK', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL, // 全属性を射影
});
```

---

## バックエンド実装解説2: API GatewayのURLマッピング

- `infra-stack.ts` でのREST APIエンドポイントとLambda関数(`shopMgmtFn`)のリンク

```typescript
// /shop/{shopId}/products にPOSTメソッドを追加し、shop-mgmt.tsへ送る設定
const shopResource = api.root.addResource('shop');
const shopIdResource = shopResource.addResource('{shopId}');
const productsResource = shopIdResource.addResource('products');

productsResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
  authorizer, // Cognito認証を通過条件として必須化
  authorizationType: apigateway.AuthorizationType.COGNITO
});
```

---

## バックエンド実装解説3: DynamoDBデータの追加と取得

- `shop-mgmt.ts` におけるデータ書き込み (`PutCommand`) と取得 (`GetCommand`) 処理

```typescript
// データの追加 (商品登録の例)
await ddb.send(new PutCommand({
    TableName: process.env.TABLE_NAME,
    Item: {
        PK: `SHOP#${shopId}`,
        SK: `PRODUCT#${productId}`,
        name, price, valid_days,
        GSI1_PK: 'PRODUCT#ACTIVE', // 検索用インデックスも同時に紐付け保存
    }
}));


// データの取得 (QR内容検証の例)
const qrRes = await ddb.send(new GetCommand({
    TableName: process.env.TABLE_NAME,
    Key: { PK: `QR#${qr_id}`, SK: 'METADATA' }
}));
```

---

## バックエンド実装解説4: 抽出データ出力(プリント)とJSON返却

- `shop-mgmt.ts` で取得・整形したデータをフロントエンドへ返す処理

```typescript
// QueryCommand等で取得した結果(res)から不要なプレフィックスを取り除き整形
const items = (res.Items || []).map(item => ({
    ...item,
    product_id: item.SK.replace('PRODUCT#', '')
}));

// HTTPステータス、CORSヘッダーと共に、JSON出力(オブジェクトを文字列化してプリント)
return { 
    statusCode: 200, 
    headers: corsHeaders, 
    body: JSON.stringify({ items }) // API Gateway経由でクライアントへそのまま返却される
};
```

---

## 本システムにおけるGSIの活用 (1)

- GSI1: 「状態や種類ごとの一覧」の取得
  - 用途: ステータスによる絞り込み検索に利用
  - GSI1_PKの例: `QR#UNASSIGNED`, `QR#ACTIVE`, `QR#USED`, `PRODUCT#ACTIVE`など
  - 検索の例: 管理画面において「未発送状態（USED）」のQRをズラッと一覧表示する操作
- GSI2: 「逆引き」や「所有者の検索」の実現
  - GSI2_PKの例1: `USER#{userId}`
    - ユーザー（オーナー）が所有する複数のショップのリストを一発で検索
  - GSI2_PKの例2: `SHOP#{shopId}`
    - 特定のショップ向けに発行された全QRのリストを一括取得

---

## 本システムにおけるGSIの活用 (2)

- 複数インデックスを利用した複雑なクエリの実現
  - GSI2の活用例（続き）
  - GSI2_PKの例3: `PRODUCT#{productId}`
    - システム全体のUUIDから、該当の商品情報を逆引き検索
- ソートキー (SK) による並び替え
  - それぞれのGSIに対応する `GSI1_SK` や `GSI2_SK` には「作成日時」等の日時文字列を保存
  - インデックス検索時に時系列などの自動ソートが可能となり、最新データの取得を容易化

---

## データ構造: 1. Shop (ショップ情報)

| 属性名 | 型 | 説明 |
|---|---|---|
| `PK` | String | `SHOP#{shopId}` （`shopId` はUUID形式） |
| `SK` | String | 常に固定値 `METADATA` |
| `name` | String | ショップ名 （任意の文字列） |
| `email` | String | ショップの連絡先メールアドレス |
| `owner_id` | String | オーナーのCognitoユーザーID （UUID形式の `sub` 属性） |
| `ts_created_at` | String | 作成日時 （ISO 8601形式のUTC日時文字列） |
| `GSI2_PK` | String | `USER#{owner_id}` （オーナーのショップ一覧取得用） |
| `GSI2_SK` | String | 作成日時等ソートキー （ISO 8601形式のUTC日時文字列） |

---

## データ構造: 2. Product (商品情報) ①

| 属性名 | 型 | 説明 |
|---|---|---|
| `PK` | String | `SHOP#{shopId}` （`shopId` はUUID形式） |
| `SK` | String | `PRODUCT#{productId}` （`productId` はUUID形式） |
| `product_id` | String | 商品自身のUUID （逆引きや参照用） |
| `name` | String | 商品名 （任意の文字列） |
| `description` | String | 商品説明 （任意のシングルライン文字列） |
| `image_url` | String | 商品画像のURL （S3への完全URLパス等） |
| `price` | Number | 価格 （0以上の正の数値） |
| `valid_days` | Number | QRコードの有効日数設定 （整数値） |
| `status` | String | 商品の販売状態 (`ACTIVE` または `STOPPED`) |

---

## データ構造: 2. Product (商品情報) ②

| 属性名 | 型 | 説明 |
|---|---|---|
| `ts_created_at` | String | 作成日時 （ISO 8601形式のUTC日時文字列） |
| `GSI1_PK` | String | `PRODUCT#{status}` （アクティブな商品一覧取得用） |
| `GSI1_SK` | String | 作成日時等のソートキー （ISO 8601形式のUTC日時文字列） |
| `GSI2_PK` | String | `PRODUCT#{productId}` （UUIDからの逆引き用） |
| `GSI2_SK` | String | 作成日時等のソートキー （ISO 8601形式のUTC日時文字列） |

---

## データ構造: 3. QR Metadata (QRコード) ①

| 属性名 | 型 | 説明 |
|---|---|---|
| `PK` | String | `QR#{uuid}` （QRコード自体のUUID形式の識別子） |
| `SK` | String | 常に固定値 `METADATA` |
| `pin` | String | 本人確認用の8桁のランダムな数字文字列 |
| `status` | String | QRの進行状態 (`UNASSIGNED` 〜 `BANNED`) |
| `shop_id` | String | 紐付け先のショップID （未連携時は空） |
| `product_id` | String | 紐付け先の商品ID （未連携時は空） |
| `memo_for_users` | String | ショップからの受取人向けメッセージ |
| `memo_for_shop` | String | ショップ自身の検索・管理用メモ欄 |

---

## データ構造: 3. QR Metadata (QRコード) ②

| 属性名 | 型 | 説明 |
|---|---|---|
| `password_hash` | String | ユーザー設定の追加パスワードハッシュ値 (現在無効化中) |
| `ts_activated_at` | String | 有効化日時 （ISO 8601形式のUTC日時文字列） |
| `ts_banned_at` | String | 無効化(BAN)日時 （ISO 8601形式のUTC日時文字列） |
| `ts_created_at` | String | QRバッチ一括生成日時 （ISO 8601形式のUTC日時文字列） |
| `ts_linked_at` | String | 商品を選択して紐付けた日時 （ISO 8601形式のUTC日時文字列） |
| `ts_submitted_at` | String | 受取人が配送先情報を送信した日時 （ISO 8601形式のUTC日時文字列） |

---

## データ構造: 3. QR Metadata (QRコード) ③

| 属性名 | 型 | 説明 |
|---|---|---|
| `ts_shipped_at` | String | ショップが商品を発送した日時 （ISO 8601形式のUTC日時文字列） |
| `ts_completed_at` | String | 取引が完了した日時 （ISO 8601形式のUTC日時文字列） |
| `ts_expired_at` | String | 有効期限日時 （有効化日時に商品のvalid_daysを加算した日時） |
| `ts_updated_at` | String | レコードの最終変更日時 （ISO 8601形式のUTC日時文字列） |
| `GSI1_PK` | String | `QR#{status}` （ステータスごとの一覧取得用） |
| `GSI1_SK` | String | 作成日時等のソートキー （ISO 8601形式のUTC日時文字列） |
| `GSI2_PK` | String | `SHOP#{shopId}` （担当ショップが持つQR一覧取得用） |
| `GSI2_SK` | String | 作成日時等のソートキー （ISO 8601形式のUTC日時文字列） |

---

## データ構造: 4. Order (配送先・注文詳細) ①

| 属性名 | 型 | 説明 |
|---|---|---|
| `PK` | String | `QR#{uuid}` （関連するQRコードのUUID） |
| `SK` | String | 常に固定値 `ORDER` |
| `name` | String | 受取人氏名 （任意の文字列） |
| `address` | String | 配送先の完全な住所 （任意の文字列） |
| `zipCode` | String | 郵便番号 （書式チェックなし・無効な文字列の可能性あり） |
| `preferredDate` | String | 配達希望日付 （YYYY-MM-DD形式等の文字列） |
| `preferredTime` | String | 配達希望時間帯 （システム定義された時間帯区分の文字列） |

---

## データ構造: 4. Order (配送先・注文詳細) ②

| 属性名 | 型 | 説明 |
|---|---|---|
| `email` | String | 連絡先メールアドレス （書式チェックなし・無効な文字列の可能性あり） |
| `phone` | String | 受取人の電話番号 （書式チェックなし・無効な文字列の可能性あり） |
| `delivery_company` | String | 発送業者の名称/運送会社等 （発送時にショップが追記） |
| `tracking_number` | String | 荷物の伝票番号・追跡番号 （発送時にショップが追記） |
| `ts_shipped_at` | String | 発送完了処理が行われた日時 （ISO 8601形式のUTC日時文字列） |
| `ts_submitted_at` | String | 受取人がこのフォームを送信した日時 （ISO 8601形式のUTC日時文字列） |
| `ts_updated_at` | String | レコードの最終変更日時 （ISO 8601形式のUTC日時文字列） |

---

## データ構造: 5. Chat (チャット履歴)

| 属性名 | 型 | 説明 |
|---|---|---|
| `PK` | String | `QR#{uuid}` （関連するQRコードのUUID） |
| `SK` | String | 常に固定値 `CHAT` |
| `messages` | Array | 本文の配列 （包含例: `sender`, `content`, `timestamp`） |
| `notification_emails` | StringSet | 新着通知の設定先メールリスト （購読を希望したメールアドレス集合） |
| `email_preferences` | Map | メール通知の設定情報マップ （言語情報等） |

---

## QRコードの状態管理とライフサイクル

QRの `status` 属性は一方通行(一部例外)で以下の状態を遷移する

1. `UNASSIGNED`: システム管理者が生成した直後（未連携）
2. `LINKED`: 特定ショップ・商品と紐付け完了（有効化前）
3. `ACTIVE`: 受取人への配付可能。有効化済・アクセス待ち
4. `USED`: 受取人が住所入力完了。ショップの発送作業待ち
5. `SHIPPED`: ショップが追跡番号を登録し発送処理完了
6. `COMPLETED`: 荷物が到着し、エンドユーザーが受取完了報告
- (例外1) `EXPIRED`: 有効期限切れ（アクセス不可）
- (例外2) `BANNED`: 管理者による不正利用強制停止

---

## 一般・受取人向けの機能フロー (`/receive`)

- ギフト要求と認証解除
  - カメラ起動後のアクセスで8桁のPINコード認証。不正ミスはバックエンドで防止
  - パスワード保護 (`RESTRICTED` 状態) の解除要求の対応
- デバイス操作: 受取手続き (`ACTIVE` → `USED`)
  - 氏名、配送先、連絡先の送信処理
- 発送待機と受取完了の報告 (`SHIPPED` → `COMPLETED`)
  - 追跡番号へのリンク追跡。荷物受領後の利用確定処理
- 問い合わせ（チャット）機能
  - 受注ID確認、チャットによる直接の連絡（システム自動イベントログ混在）
  - Eメールによる新着通知購読の対応設定

---

## ショップ管理者向けの機能フロー (`/shop`)

- デバイス操作: ショップ管理と商品の追加
  - S3アップロード画像の16:9比率等へのクライアント側リサイズ実行
- デバイス操作: QRコード紐付けと稼働 (Activate)
  - カメラ・キー入力でのQR(UUID)の特定と状態の結合
  - 受取人側へのメッセージ登録処理（`memo_for_users`）
- デバイス操作: 配送機能の実行
  - `USED` 状態注文の一覧データ取得
  - 配送業者名・追跡番号の一括・個別登録処理と `SHIPPED` への状態の移行

---

## システム管理者向けの機能フロー (`/admin`)

- アクセス制限と一括管理の実行
  - 運用側グループ(Administrators)によるQRコード一括生成（最大10枚バッチ）
  - `{shopId}`、`{productId}`の事前指定状態(`LINKED`状態)での発行処理対応
- オフライン媒体支援の自動化
  - バッチ完了処理と同時の即時的なQR印刷用両面PDFの自動書き出し、ダウンロード
- 不正処理とステータスデータの排除機能
  - データ内の一致検索。漏洩疑義QRデータの `BANNED` 変更
  - BANNED状態のデータの永続的な抹消（完全データ削除処理）

---

## セキュリティ実装 (権限管理・エラーの隠蔽化)

- クライアント情報の検証
  - Lambda内でのテナントID (`owner_id`) の完全一致チェック (`403` 返却)
- エラー等の動的隠蔽 (APIステルス化設計)
  - API Gatewayでの権限不足一括変換 (`404 Not Found` への偽装変更)
  - セキュリティ攻撃に対するエンドポイントの存在秘匿
- IAM Roleの分離設計と最小権限構成
  - 各Lambdaへの関数単位での「読取専用」「S3書込のみ」権限個別定義の運用
- 強固なパスワードポリシー制約
  - 最低8文字構成(英大/小・数字必須)。MFAオプションの事前定義への対応設計

---

## バックエンド実装解説5: API Gatewayの認可設定とIAM

- `CognitoUserPoolsAuthorizer` を経由する保護と最小権限 (Least Privilege) の原則

```typescript
// API Gateway: 特定リソースに対するCognito認可の組み込み例
generateResource.addMethod('POST', new apigateway.LambdaIntegration(adminGenerateFn), {
  authorizer, // Cognitoでのログイン・トークン認証をAPI通過条件に必須化
  authorizationType: apigateway.AuthorizationType.COGNITO
});

// IAM Role: 管理APIに「テーブル読み書き」等の最小限のシステム実行権限のみ付与
table.grantReadWriteData(shopMgmtFn);
// ※一覧等API(adminListFn)には .grantReadData() のみ付与して悪用の被害を最小化
```

---

## バックエンド実装解説6: テナント分離（所有者権限）の検証

- 他の所有者のデータを操作できないようにするLambda内でのプロテクト (`shop-mgmt.ts`)

```typescript
// Cognitoの認証トークン(authorizer)からアクセス元ユーザーの真のIDを確証
const claims = event.requestContext?.authorizer?.claims;
const userId = claims?.sub;

// 対象データの所有者がアクセスユーザーと合致しているかを検証
const getRes = await ddb.send(new GetCommand({ /*...省略...*/ }));
const targetShopOwner = getRes.Item.owner_id;

// 所有者が異なる場合は例外をスローして実行をブロック（テナントの分離）
if (targetShopOwner && targetShopOwner !== userId) {
    throw new Error('Forbidden'); // 以降の更新(Update)や削除(Delete)を中止
}
```

---

## バックエンド実装解説7: APIエラー隠蔽化のコード例

- ステルス化通信: エラーレスポンスでの意図的な404偽装処理 (`infra-stack.ts`)

```typescript
api.addGatewayResponse('Default401Response', {
  type: apigateway.ResponseType.UNAUTHORIZED,
  statusCode: '404', // ← 401(未認証)をあえて404であると見せかけ秘匿
  responseParameters: {
    'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
    'gatewayresponse.header.Access-Control-Allow-Headers': "'*'",
    'gatewayresponse.header.Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS,PATCH'",
  },
  templates: {
    'application/json': '{"message": "Not Found."}' // メッセージも404風に変更
  }
} as any);
```

---

## セキュリティ実装 (改ざん・攻撃への防御)

- PIN入力のブルートフォース（総当たり攻撃）防止処理
  - 検証実行時の失敗記録。5回エラーで `locked_until` を用いる30分間一時ロックの適用
- 整合性維持のためのトランザクション化
  - 住所登録(`Put`)とQR更新(`Update`)の同時処理と `TransactWriteCommand` の指定
  - `ConditionExpression` 指定の動的処理による二重登録（レースコンディション）完全無効化
- ファイルストレージの保護制限処理
  - バッチからの期限付き(5分)・署名付きURLを用いたS3大容量ファイル制限対応の構築

---

## バックエンド実装解説8: S3・Cognito保護のコード例

- S3大容量ファイル攻撃防御 (CORS制限)とCognitoのパスワードポリシー

```typescript
// S3: 許可されたドメインのクライアントからのみ直接アップロードを許可
cors: [{
    allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
    allowedOrigins: ['https://meishigawarini.com', 'http://localhost:3000'],
}],

// Cognito: 堅牢なユーザー保護ポリシーの強制
passwordPolicy: {
  minLength: 8,
  requireLowercase: true,
  requireUppercase: true,
requireDigits: true, // 英大小文字・数字を必須化して強度を担保
},
mfa: cognito.Mfa.OPTIONAL, // 二要素認証(MFA)も利用可能に設定
```

---

## バックエンド実装解説9: S3への直接アップロード(署名付きURL)

- `shop-mgmt.ts` にて、S3へ画像を書き込むための一時的な許可URLを生成し返却する処理

```typescript
// 1. S3への書き込みを指示するコマンドの定義 (PutObject)
const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: `shop/${shopId}/products/${filename}`, // 保存先の完全パス
    ContentType: contentType
});

// 2. 5分間(300秒)のみ有効な書き込み専用の「署名付きURL」を生成
const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

// 3. フロントで画像を表示するためのパブリックな固定URLも構築して、2つ同時にJSONで返却
const publicUrl = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;
return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ uploadUrl, publicUrl }) };
// ※フロントエンドは受け取ったuploadUrlに向けてPUTリクエストで画像を直接送信する
```

---

## バックエンド実装解説10: 外部API (Resend) によるメール送信

- `email-client.ts` における、Resend APIを利用したメールの一斉送信処理の実装

```typescript
import { Resend } from 'resend';

// infra-stack.ts 等のCDK経由で渡された環境変数からAPIキー等を読み込み
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const resend = new Resend(RESEND_API_KEY);

// Lambda内から呼び出すための非同期メール送信関数
export async function sendEmail({ to, subject, text, html }: SendEmailParams) {
    const data = await resend.emails.send({
        from: SENDER_EMAIL,
        to: Array.isArray(to) ? to : [to], // 複数の宛先にも対応
        subject: subject,
        text: text,
        html: html,
    });
    // API連携エラー時のハンドリングも実装・管理
    if (data.error) throw new Error(`Resend Error: ${data.error.message}`);
    return data;
}
```

---

## ローカル開発環境のセットアップと運用

- ツールの導入とAWS設定手順
  - GitHub権限設定、環境ファイル (`.env.local`)
  - AWS IAM Identity Centerベースのセッション (`aws login`) 及び `npm install`
- CD/CIの運用の仕組み
  - フロント側設定: GitHubの `main` 統合に伴うAmplifyプラットフォーム上での自動デプロイ
  - バックエンド側処理1: `npx cdk synth` での生成検証、`npx cdk diff`の構成削除リスク確認
  - バックエンド側処理2: コマンドラインからの手動構成変更適用 (`npx cdk deploy`)
- トラブルシューティング（依存関係競合への自動対応）
  - パッケージロック等の物理ファイルの全削除および `npm ci` でのクリーン実装再構築

---

## 開発時セットアップ: アカウント作成チェックリスト

- [ ] (参加者) 管理者(オーナー)へアカウント作成依頼とGitHubアカウントの共有連絡
- [ ] (管理者) AWS IAM Identity Center等にて新メンバーのアカウント発行
- [ ] (管理者) Slack等にて以下の必須「4点セット」を参加者へ共有
  1. AWSログイン用「スタートURL」「初期ユーザー名」「初期パスワード」
  2. GitHubリポジトリ ([yudaiito9124-cyber/meishigawarini](https://github.com/yudaiito9124-cyber/meishigawarini)) の招待
  3. 必須環境変数群 (`.env.local`, `.env` ファイル等の内容)
  4. (必要時) Resend等のテスト用外部APIキー
- [ ] (参加者) 共有情報を基にローカル環境から `aws login` による初期認証完了

---

## 開発時セットアップ: 頻出コマンド早見表

- フロントエンド操作 (`cd frontend`)
  - `npm install` : 初期構築時の依存パッケージの取得
  | `npm run dev` : ローカルPCでの開発用画面起動 (`localhost:3000`)
- バックエンド・インフラ操作 (`cd infra`)
  - `npx cdk synth` : コードエラー確認用のAWSリソース定義ビルド
  - `npx cdk diff`  : AWS現行環境と修正コード間の差分（追加・削除）の確認
  - `npx cdk deploy`: AWS本番環境への変更内容の直接適用・デプロイ処理
- 共通のトラシュー・初期化操作
  - `npm ci` : 競合・エラー発生時の `package-lock.json` 依存のクリーンインストール

---

## フロントエンド実装: UIとCSS技術スタック

- `Tailwind CSS` によるユーティリティファーストなスタイリング
  - CSSファイルを分けず、クラス名 (`className="flex p-4 text-center"`) 内でデザイン完結
- `Shadcn/ui` によるモダンなコンポーネント構成 (`@radix-ui` ベース)
  - コピー＆ペーストベースの非依存型UI。システム全体で統一されたデザインシステムを提供
- その他重要な機能ライブラリ
  - `html5-qrcode` / `qrcode`: QRコードのカメラ読み取りおよび画像生成
  - `jspdf`: バッチ作成時のクライアント側での両面・ラベル用PDF即時生成
  - `next-intl`: `/[locale]/` などを用いたi18n(多言語)ルーティングと文字列切り替え

---

## フロントエンド実装解説: UIとCSSコード例

- `Tailwind CSS` と `Shadcn/ui` を組み合わせた記述例 (`app/[locale]/admin/page.tsx` より)

```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Tailwindのユーティリティクラス(flex, gap-2, bg-white等)で直接レイアウト・装飾を指定
<Card>
    <CardHeader>
        <CardTitle className="flex justify-between items-center">
            <span>タイトル</span>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={...}>更新</Button>
            </div>
        </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4 bg-white border rounded-md p-4">
        ...
    </CardContent>
</Card>
```

---

## 【今後の展開】 ショップ間の商品インポート機能

- 同一オーナー（別ショップ間）でのインポート
  - 要件: 自身が所有する別店舗(`shopId`)を指定し、商品を複製
  - 解決策: 複製元と先、両ショップの `owner_id` と `userId` を検証。合致すれば新レコード (`PK: SHOP#{新shopId}`, `SK: PRODUCT#{新Id}`) として保存し複製
- 異なるオーナー間でのインポート（承認システム）
  - 要件: 他オーナー商品のインポートを、明示的な許可ベースで実現
  - 解決策(案1: トークン方式): 複製元がDBに「共有用トークン」を発行・保存。複製先が入力して認証を通過した場合に複製を許可
  - 解決策(案2: 申請・承認方式): 複製先がDBに `IMPORT_REQUEST` レコードを作成。複製元が管理画面で「承認」した場合に限り、複製APIの実行を許可