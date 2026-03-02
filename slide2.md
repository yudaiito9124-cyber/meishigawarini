---
marp: true
theme: default
paginate: true
size: 16:9
header: '"名刺代わりに" 開発・オンボーディング'
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

# 「名刺代わりに」 開発・オンボーディング

詳細仕様・システムアーキテクチャ・運用ガイド体系化資料
---

## プロジェクトの全体コンセプト

- 物理的なQRコードを用いたギフト・商品贈受システム
- ユーザー体験 (UX) のシームレス化
  - 物理カードのQRからWebへ誘導し、商品の確認から配送先入力まで完結
- システム利用者の4分類と役割
  1. 一般・未認証: LPやログインページへのアクセス
  2. 受取人 (エンドユーザー): QR読取、PIN入力によるギフト要求・受領
  3. ショップ管理者: 商品カタログ登録、QRと商品の紐付け、注文・発送管理
  4. システム管理者: 権限グループ所属者。完全管理と運用監視
---

## アプリケーション構成

- `frontend/` ディレクトリ (画面側)
  - Next.js (App Router, React 19), Tailwind CSS, Shadcn/ui
  - 動的ルーティング (`/[locale]/`) による多言語(i18n)化
- フロントエンドの運用・デプロイ
  - AWS Amplifyによる自動ホスティング
  - GitHubの `main` ブランチPUSHと連動した自動デプロイ
---

## インフラ構成 (サーバーレスアーキテクチャ)

- `infra/` ディレクトリ (バックエンド側)
  - AWS CDK v2 (TypeScript) による Infrastructure as Code (IaC)
- 主要AWSサービス
  - AWS Lambda: 機能ごとに細分化されたAPIロジック本体
  - Amazon API Gateway: HTTPリクエストのエンドポイント・ルーティング
  - Amazon DynamoDB: シングルテーブル設計によるフルマネージドNoSQL
  - Amazon Cognito: IAM連携によるユーザー認証および権限管理
  - Amazon S3: 商品画像等のアップロード用ストレージ
---

## DB設計: DynamoDB シングルテーブル設計

- 採用する唯一のテーブル: `MeishiGawariniTableV2`
- テーブル統合の概念
  - ショップ、商品、QR状態、注文などの異なる性質のデータを混在
  - メリット: 大量アクセスへの耐性と最速・最安のパフォーマンス
- キーの組み合わせによる特定
  - PK (Partition Key): データが入っている「大きな箱」の名前
  - SK (Sort Key): 箱の中にある「個々の書類」の名前
---

## DB設計: GSI（グローバルセカンダリインデックス）

- GSIの概念と目的
  - PKとSKでしか検索できない特性を補う「裏口」の検索インデックス
  - メインの箱以外の、別の切り口や条件でデータを素早く集める仕組み
- インデックスキーの設定
  - GSI専用のPKとSK (`GSI1_PK`, `GSI1_SK`, `GSI2_PK`, `GSI2_SK`) をコピー保存
- 本システムでのGSI1の活用
  - 用途: ステータス別の絞り込み検索（例: 未発送 `QR#USED` の一覧）
---

## DB設計: GSIの活用例 (逆引き検索)

- 本システムでのGSI2の活用
  - オーナーの特定ショップ群検索 (`USER#{userId}`)
  - 特定ショップ向けの全QRのリスト一括取得 (`SHOP#{shopId}`)
  - UUIDからの情報逆引き検索 (`PRODUCT#{productId}`)
- ソートキー (SK) による並び替え
  - 各GSIの `SK` に「作成日時等」を含め、時系列での自動ソートを実現
---

## データ構造: 1. Shop (ショップ情報)

| 属性名 | 型 | 説明 |
|---|---|---|
| `PK` | String | `SHOP#{shopId}` （`shopId` はUUID形式） |
| `SK` | String | 常に固定値 `METADATA` |
| `name` | String | ショップ名 （任意の文字列） |
| `email` | String | ショップの連絡先メールアドレス |
| `owner_id` | String | オーナーのCognitoユーザーID |
| `GSI2_PK` | String | `USER#{owner_id}` （オーナーのショップ一覧取得用） |
---

## データ構造: 2. Product (商品情報) ①

| 属性名 | 型 | 説明 |
|---|---|---|
| `PK` | String | `SHOP#{shopId}` （`shopId` はUUID形式） |
| `SK` | String | `PRODUCT#{productId}` （`productId` はUUID形式） |
| `product_id` | String | 商品自身のUUID （逆引きや参照用） |
| `name` | String | 商品名 （任意の文字列） |
| `image_url` | String | 商品画像のURL （S3への完全URLパス等） |
| `price` | Number | 価格 （0以上の正の数値） |
---

## データ構造: 2. Product (商品情報) ②

| 属性名 | 型 | 説明 |
|---|---|---|
| `valid_days` | Number | QRコードの有効日数設定 （整数値） |
| `status` | String | 商品の販売状態 (`ACTIVE` または `STOPPED`) |
| `GSI1_PK` | String | `PRODUCT#{status}` （アクティブな商品取得用） |
| `GSI2_PK` | String | `PRODUCT#{productId}` （UUIDからの逆引き用） |

- **商品の削除可否制限**
  - ステータスが `STOPPED` かつ、有効化・使用中のQRコードが1つも存在しない場合のみ削除可能
---

## データ構造: 3. QR Metadata (QRコード) ①

| 属性名 | 型 | 説明 |
|---|---|---|
| `PK` | String | `QR#{uuid}` （QRコード自体のUUID識別子） |
| `SK` | String | 常に固定値 `METADATA` |
| `pin` | String | 本人確認用の8桁のランダムな数字文字列 |
| `status` | String | QRの進行状態 (`UNASSIGNED` 〜 `BANNED`) |
| `shop_id` | String | 紐付け先のショップID （未連携時は空） |
| `product_id` | String | 紐付け先の商品ID （未連携時は空） |
---

## データ構造: 3. QR Metadata (QRコード) ②

| 属性名 | 型 | 説明 |
|---|---|---|
| `memo_for_users` | String | ショップからの受取人向けメッセージ |
| `memo_for_shop` | String | ショップ自身の検索・管理用メモ欄 |
| `ts_activated_at`| String | 有効化日時 （ISO 8601形式） |
| `GSI1_PK` | String | `QR#{status}` （ステータスごとの一覧取得用） |
| `GSI2_PK` | String | `SHOP#{shopId}` （担当ショップ一覧取得用） |
---

## データ構造: 4. Order (配送先) ①

| 属性名 | 型 | 説明 |
|---|---|---|
| `PK` | String | `QR#{uuid}` （関連するQRコードのUUID） |
| `SK` | String | 常に固定値 `ORDER` |
| `name` | String | 受取人氏名 （任意の文字列） |
| `address` | String | 配送先の完全な住所 （任意の文字列） |
| `zipCode` | String | 郵便番号 （書式チェックなし） |
| `preferredDate` | String | 配達希望日付 （YYYY-MM-DD形式等） |
---

## データ構造: 4. Order (配送先) ②

| 属性名 | 型 | 説明 |
|---|---|---|
| `preferredTime` | String | 配達希望時間帯 （システム定義の時間帯） |
| `phone` | String | 受取人の電話番号 |
| `delivery_company` | String | 運送会社等 （ショップが追記） |
| `tracking_number` | String | 追跡番号 （ショップが追記） |
| `ts_shipped_at` | String | 発送完了処理日時 （ISO 8601形式） |
---

## データ構造: 5. Chat (チャット履歴)

| 属性名 | 型 | 説明 |
|---|---|---|
| `PK` | String | `QR#{uuid}` （関連するQRコードのUUID） |
| `SK` | String | 常に固定値 `CHAT` |
| `messages` | Array | 本文の配列 （ `sender`, `content`, `timestamp`等） |
| `notification_emails` | StringSet | 新着通知の設定先メールリスト |
| `email_preferences` | Map | メール通知の設定情報マップ （言語情報等） |
---

## QRコードの状態管理とライフサイクル

- `status` 属性は原則一方通行で以下の遷移を行う
  1. `UNASSIGNED`: システム管理者が生成し、ショップ・商品未連携の状態
  2. `LINKED`: 特定ショップ・商品紐付け完了、有効化前
  3. `ACTIVE`: 配付可能状態。有効化済・エンドユーザーからのアクセス待ち
  4. `USED`: エンドユーザー住址等入力完了。ショップの発送作業待ち
  5. `SHIPPED`: ショップが追跡番号を登録し発送処理完了
  6. `COMPLETED`: 荷物が到着し、エンドユーザーが受取完了報告実行
---

## QRコードの状態管理 (例外状態)

- (例外1) `EXPIRED`: 有効期限切れ（アクセス不可）
  - システムが定める有効日数を過ぎたため利用不能
- (例外2) `BANNED`: 管理者による不正利用・強制停止
  - 情報漏洩や不正利用疑義時に管理者が強制ブロック
  - QR機能が完全に停止され、ユーザー・ショップ双方の操作を遮断
---

## 認証・一般向けページ機能遷移

- トップページ・ログイン処理 (`/`, `/login`)
  - CognitoAPIによる認証完了後、ショップ一覧へ自動リダイレクト
  - 未認証時は検証コード入力画面への自動誘導
- 新規登録・初期認証 (`/register`, `/verify`)
  - アカウント作成とメールに届く6桁の検証コードによる有効化
  - 検証通過により正式なアクセス権限(Cognito Account)の確立
---

## 受取人・エンドユーザー向け機能 (`/receive`) ①

- ギフト要求・セキュリティステップ (`ACTIVE` → `FORM`)
  - カメラ起動後のアクセスで8桁のPINコード認証。バックエンドで総当り防止
  - パスワード保護設定 (`RESTRICTED` 状態) の解除要求対応
- デバイス操作: 受取手続き (`ACTIVE` → `USED`)
  - 商品・説明の閲覧
  - 氏名、配送先住所、電話番号、配達希望日時の送信処理
---

## 受取人・エンドユーザー向け機能 (`/receive`) ②

- 発送待機・追跡・受取完了処理 (`SHIPPED` → `COMPLETED`)
  - ショップ発送後に追跡番号の表示および配送業者リンクの提供
  - 荷物受領後の「受取完了」操作によるシステムの最終化
- 問い合わせ（チャット）機能
  - 受注ID確認、チャットによる直接メッセージとシステム自動ログの混在表示
  - Eメールによる新着通知購読の対応設定
---

## ショップ管理者向け機能 (`/shop`) ①

- ショップ管理ダッシュボード
  - ログインユーザーが権限を持つショップを一覧表示 (`/shop`)
  - 新規ショップ作成時の動的DB追加の実行
- 商品 (Product) 管理機能
  - 商品名、価格、画像等の商品カタログ追加
  - S3アップロード画像の規定比率(16:9等)へのクライアント側リサイズ実行
  - 取扱い停止 (`STOPPED`) および安全ステータス確認後の商品削除対応
---

## ショップ管理者向け機能 (`/shop`) ②

- QRコード連携設定と配付 (Activate)
  - カメラ・キー入力でのQR(UUID)特定と `ACTIVE` 商品の選択・状態の結合
  - 受取人および自店舗向けのメッセージ付与(`memo_for_users`, `memo_for_shop`)
- 配送・受注管理機能
  - `USED` 状態の受注一覧の取得・詳細ダイアログ閲覧
  - 配送業者名・追跡番号登録のよる `SHIPPED` への状態移行（発送処理）
---

## システム管理者向け機能 (`/admin`)

- 運用側グループ(Administrators)固有の一括管理
- QRコード一括生成機能
  - 汎用(`UNASSIGNED`)QRの最大10枚バッチ処理生成
  - `{shopId}`, `{productId}` 事前指定(`LINKED`状態)バッチ生成
- 自動PDF生成機能
  - バッチ完了処理と同時のQR印刷用両面PDF自動生成・ダウンロード支援
- システム監視・データ統制機能
  - ステータス別集計、UUID個別照会、不正QRの `BANNED` 化および完全削除
---

## バックエンド実装: DynamoDBとCDK構成

- シングルテーブルの生成とインデックス定義

```typescript
const table = new dynamodb.Table(this, 'MeishiGawariniTableV2', {
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
});
// 状態等で検索するための検索用裏口(GSI)の定義
table.addGlobalSecondaryIndex({
  indexName: 'GSI1', /* PK: GSI1_PK, SK: GSI1_SK ... */
});
```
---

## バックエンド実装: DBデータの操作例

- `PutCommand` と `GetCommand` 処理例

```typescript
// 商品登録等の書込み
await ddb.send(new PutCommand({
    TableName: process.env.TABLE_NAME,
    Item: { PK: `SHOP#${shopId}`, SK: `PRODUCT#${productId}`, /* ... */ }
}));

// QR内容の検証等での読取り
const getRes = await ddb.send(new GetCommand({
    TableName: process.env.TABLE_NAME,
    Key: { PK: `QR#${uuid}`, SK: 'METADATA' }
}));
```
---

## セキュリティ実装の基本方針

- API Gatewayレベルでの防御
  - Cognito認可による不正アクセスブロック
  - CORS最適化 (Preflight `OPTIONS` 許容) と認証エラーの404偽装・秘匿
- IAMの最小権限原則 (Least Privilege)
  - 役割ごとにLambdaを分割し、不要な読取・書込権限を排除
- アカウント保護
  - Cognitoの強固なパスワードポリシー制約（8文字・英大小・数字必須）
---

## セキュリティ: テナント分離（所有者権限の検証）

- トークンによる他人のテナントデータ（Shop等）操作のブロック機構

```typescript
// トークン(authorizer)からアクセス元ユーザーの真のIDを確証
const claims = event.requestContext?.authorizer?.claims;
const userId = claims?.sub;

// 対象データのオーナーがアクセスユーザーと合致しているか検証
const getRes = await ddb.send(new GetCommand({ /*...*/ }));
if (getRes.Item.owner_id && getRes.Item.owner_id !== userId) {
    throw new Error('Forbidden'); // 以降の更新(Update)・削除(Delete)を中止
}
```
---

## セキュリティ: APIエラーの隠蔽化 (ステルス化設計)

- 認証エラー(401/403)時の応答を404に偽装

```typescript
// APIの存在自体を隠匿するためのGatewayResponse設定例
api.addGatewayResponse('Default401Response', {
  type: apigateway.ResponseType.UNAUTHORIZED,
  statusCode: '404', // 401(未認証)をあえて404の見せかけに変更
  responseParameters: { 'gatewayresponse...Access-Control-Allow-Origin': "'*'" },
  templates: { 'application/json': '{"message": "Not Found."}' }
} as any);
```
---

## セキュリティ: ブルートフォース攻撃対策

- PIN入力の総当たり攻撃防止機構
- 認証失敗の記録化と一時ロック機能
  - PIN入力時に失敗回数をカウントアップ
  - 5回エラーで `locked_until` 時間を更新し、対象QRを30分間操作不能状態に移行
  - アクセス初回にロック状態を検証し、ロック中なら即座に `403 Forbidden` を返却
---

## セキュリティ: トランザクション処理 (データ整合性確保)

- 注文データ作成とQRステータス更新の強力な同時同期

```typescript
// 二重操作やデータ齟齬を完全防止する TransactWriteCommand
await ddb.send(new TransactWriteCommand({
    TransactItems: [
        // 処理1: QRを USED 等にUpdate。※現在の状態が ACTIVE な場合のみ許可
        { Update: { TableName, Key, ConditionExpression: '#status = :active' } },
        // 処理2: 同時に、送り先情報を ORDER 等としてPut
        { Put: { TableName, Item: { PK: `QR#...`, SK: 'ORDER', ... } } }
    ]
}));
```
---

## セキュリティ: S3直接アップロード保護（署名付きURL）

- サーバーを中継せず、権限のある大容量ファイル安全送信をサポート

```typescript
// 1. S3への書き込みを指示するコマンドの定義 (PutObject)
const command = new PutObjectCommand({ Bucket, Key, ContentType });

// 2. 5分間(300秒)のみ有効な書き込み専用の「署名付きURL」を発行
const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

// 3. フロントエンドはこのURLに向けてPUTリクエストで画像を直接送信
return { body: JSON.stringify({ uploadUrl }) };
```
---

## バックエンド実装: 外部API (Resend) によるメール送信

- `email-client.ts` による一斉送信・トランザクションメールの運用

```typescript
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({ to, subject, text, html }: SendEmailParams) {
    const data = await resend.emails.send({
        from: process.env.SENDER_EMAIL, to: Array.isArray(to) ? to : [to],
        subject, text, html,
    });
    if (data.error) throw new Error(`Resend Error: ${data.error.message}`);
    return data;
}
```
---

## ローカル開発環境セットアップ (アカウント・ツール)

1. AWS権限制御とGitHub連携
   - 管理者(オーナー)がAWS IAM(Identity Center)で開発者ごとの子ユーザーを発行
   - 対象GitHubリポジトリ (`yudaiito9124-cyber/meishigawarini`) の共有・招待の完了
2. 必須ツールのインストール
   - Visual Studio Code (VS Code)、Git
   - Node.js (JavaScriptエンジン、LTS版の導入)
   - AWS CLI (クラウド操作ツール) のインストール
---

## ローカル開発環境セットアップ (実行手順)

- コードの取得 (`git clone`) 及び各所へのアクセス制限情報 (`.env.local`) の配置
- 認証の実行
  - `aws login` によるSSO認証の実行
  - 初回CDK利用時の管理用バケット生成コマンド `npx cdk bootstrap` の実行
- 依存関係のインストールと環境起ち上げ
  - 各ディレクトリ (`frontend`, `infra`) にて `npm install` 実行
  - `npm run dev` によるローカル画面の確認 (`localhost:3000`)
---

## 開発時操作ガイド: フロントエンド・トラブル回避

- GitHubと密接に連携したフロントエンドデプロイ
  - `git push` 後、`main` ブランチへの統合（マージ）だけで自動更新の仕組み
- `package-lock.json` 設定エラーのクリーンナップ手法
  - 他開発者の更新による不整合・依存競合事案発生時対応
  - 構成ファイルの一括削除 (`rm -rf node_modules package-lock.json`) と `npm install` 再実行の徹底
---

## 開発時操作ガイド: バックエンド（インフラ操作）

- `infra/` フォルダ配下でのCDK基盤コマンドの利用
- コード検証と差出テスト
  - `npx cdk synth` : コードエラー確認用のAWSリソース定義ビルド
  - `npx cdk diff`  : AWS現行環境と修正コード間の差分（追加・削除の構成リスク）確認
- 実環境への反映
  - `npx cdk deploy` : AWS本番環境への変更内容の直接適用・デプロイ直接処理実行
---

## 【今後の展開】 ショップ間の商品インポート機能

- 同一オーナー（別ショップ間）でのインポート
  - 要件: 自身所有の別店舗 (`shopId`) から商品の複製を実行
  - 解決策: 両ショップの `owner_id` と `userId` の一致検証。新レコードの自動生成
- 異なるオーナー間でのインポート（承認システム）
  - 要件: 明示的な許可ベースでの他オーナー商品のインポート実現
  - 解決策案: トークン配布による認証通過、またはシステム画面上の申請(`IMPORT_REQUEST`)からの明示的承諾フローの確立
