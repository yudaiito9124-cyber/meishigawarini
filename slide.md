---
marp: true
theme: default
paginate: true
size: 16:9
header: '"名刺代わりに" 開発・オンボーディング'
style: |
  section { font-size: 22px; padding: 40px; }
  h1 { font-size: 34px; color: #2c3e50; margin-bottom: 20px; }
  h2 { font-size: 26px; color: #34495e; border-bottom: 2px solid #bdc3c7; padding-bottom: 5px; margin-bottom: 15px; }
  h3 { font-size: 22px; color: #34495e; margin-bottom: 10px; }
  ul { margin-bottom: 10px; line-height: 1.35; }
  li { margin-bottom: 5px; }
  table { font-size: 14px; width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #bdc3c7; padding: 4px; }
  th { background-color: #ecf0f1; }
  pre { font-size: 14px; }
---

# 1. 共同開発にあたってのAWS環境・権限設定ガイド

## 1. AWSアカウントの基本構造（親子関係）
本プロジェクトでは、1つの **AWSメインアカウント** を共有し、その中に開発者ごとの **IAMユーザー** を作成して運用します。

* **メインアカウント (親)**:
    * 支払い（請求）が一括管理される場所。
    * DynamoDB, S3, Cognito などの実リソースが存在する場所。
* **IAMユーザー (子)**:
    * 開発者個人のログインID。
    * 「誰がどの操作をしたか」を識別するために、開発者ごとに作成します。

---

## 2. 新規開発者をプロジェクトに招待する手順（管理者向け）
管理者は新規メンバーに対して以下を用意し、Slack等の安全なツールで渡してください。

1. **GitHubリポジトリの招待**: `yudaiito9124-cyber/meishigawarini` への Write 権限付き招待。
2. **AWS IAMユーザーの発行**: AWS IAM Identity Center 等で新規ユーザーを作成します。発行された `ログインURL` `ユーザー名` `初期パスワード`。
3. **環境変数 (`.env.local` / `.env`)**: API URLや各種シークレットなどの動作に必要な設定値。
4. *(必要に応じて)* **Resend (メール送信) のテスト用APIキー**

---

## 3. 開発者側（メンバー）が行う初期設定

**① AWS CLIのインストールと認証（SSOログイン）**
ローカル環境からCDKコマンド等を実行するために必要です。
```bash
aws login
```
*(※初回設定時や、SSO環境が未構築の場合は、管理者に共有されたスタートURLを用いて `aws configure sso` コマンドで初期セットアップを完了させてから `aws login` を実行してください。)*

**② CDK Bootstrap の実行**
その環境（リージョン）で初めてCDKを使う際、デプロイ用の管理リソース（S3バケット等）を作成する必要があります。
```bash
npx cdk bootstrap
```

---

# 2. API Gateway 実装ガイド

## 1. API Gatewayとは？
フロントエンド（React/Next.jsなど）からのHTTPリクエストを受け取り、適切なバックエンド処理（Lambda関数）へ振り分ける「受付窓口」の役割を果たします。

主に以下の3つの機能をAPI Gatewayで設定しています。
1. **ルーティング**: URLパスパス（例: `/shop`, `/admin`）に応じたLambdaの呼び出し
2. **CORS設定**: フロントエンド（異なるドメイン）からの安全なアクセス許可
3. **認証 (Authorizer)**: ログイン済みユーザー（Cognito）のみアクセスできるルートの保護

---

## 2. API Gatewayの基本構成とCORS設定
`infra/lib/infra-stack.ts` にて定義されています。
デフォルトでCORSのPreflightリクエスト（`OPTIONS`）に応答する設定が行われています。

**特殊なCORSエラー対策（Gateway Responses）**
認証エラー（401）などでLambdaに到達する前にAPI Gatewayがエラーを返す場合、デフォルトではCORSヘッダーが付与されず、フロントエンドで原因不明のCORSエラーになります。これを防ぐためにセキュリティ上、APIの存在自体を隠蔽するため404を返しています。

```typescript
// 認証エラー(401)を 404 に偽装しつつ CORS を許可
api.addGatewayResponse('Default401Response', {
  type: apigateway.ResponseType.UNAUTHORIZED,
  statusCode: '404',
});
```

---

## 3. Cognito認証（Authorizer）との連携
「ショップオーナー」や「管理者」のみが実行できるAPIを守るために、Cognito User Poolを利用したオーソライザーを設定しています。

```typescript
const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'ShopAuthorizer', {
  cognitoUserPools: [userPool],
});
```

## 4. ルーティングとLambdaの統合
**① 認証が不要なAPI（一般ユーザー向け）**
`submitResource.addMethod('POST', new apigateway.LambdaIntegration(recipientSubmitFn));`

**② 認証が必要なAPI（管理者・オーナー向け）**
ログイン必須のAPIには `authorizer` をアタッチします。
```typescript
productsResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
  authorizer, // Cognito Authorizerの適用
  authorizationType: apigateway.AuthorizationType.COGNITO
});
```

---

# 3. データベース仕様および操作一覧

Amazon DynamoDB (テーブル名: `MeishiGawariniTableV2`) のシングルテーブルデザインが採用されています。`PK` (パーティションキー) と `SK` (ソートキー)、および2つのGSI (グローバルセカンダリインデックス) を活用して一つのテーブルに格納されています。

## 1. データの種類（エンティティ一覧）

| エンティティ種別 | PK (Partition Key) | SK (Sort Key) |
| --- | --- | --- |
| **Shop Metadata (ショップ情報)** | `SHOP#{shopId}` | `METADATA` |
| **Shop Product (商品情報)** | `SHOP#{shopId}` | `PRODUCT#{productId}` |
| **QR Metadata (QRコード及び注文ステータス)** | `QR#{uuid}` | `METADATA` |
| **QR Order (受取人入力の配送先情報)** | `QR#{uuid}` | `ORDER` |
| **QR Chat (チャット履歴)** | `QR#{uuid}` | `CHAT` |

---

## 2. 各データ構造の詳細（Shop, Product）

**2.1 Shop (ショップ情報)**
| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` / `SK`| String | `SHOP#{shopId}` / `METADATA` |
| `name` / `email`| String | ショップ名 / ショップの連絡先メールアドレス |
| `owner_id` | String | オーナーのCognitoユーザーID （UUID形式の `sub` 属性） |
| `GSI2_PK` / `GSI2_SK`| String | `USER#{owner_id}` / 作成日時等ソートキー |

**2.2 Product (商品情報)**
| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` / `SK`| String | `SHOP#{shopId}` / `PRODUCT#{productId}` |
| `name` / `description` | String | 商品名 / 商品説明 |
| `image_url` / `price` | String / Number | 商品画像のURL / 価格 |
| `valid_days` / `status`| Number / String | QRコードの有効日数設定 / 商品の販売状態 (`ACTIVE` または `STOPPED`) |
| `GSI1_PK` / `GSI1_SK` | String | `PRODUCT#{status}` / 作成日時等のソートキー |
| `GSI2_PK` / `GSI2_SK` | String | `PRODUCT#{productId}` / 作成日時等のソートキー |

---

## 2. 各データ構造の詳細（QR Metadata）

**2.3 QR Metadata (QRコード及び注文ステータス)**
| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` / `SK` | String | `QR#{uuid}` / `METADATA` |
| `pin` | String | 本人確認用の8桁のランダムな数字文字列 |
| `status` | String | QRの進行状態 (`UNASSIGNED` 〜 `BANNED`) |
| `shop_id` / `product_id`| String | 紐付け先のショップID / 紐付け先の商品ID |
| `memo_for_users` / `memo_for_shop` | String | ショップからの受取人向けメッセージ / ショップ自身の検索・管理用メモ欄 |
| `ts_*_at` | String | 各種タイムスタンプ（ISO 8601形式のUTC日時文字列） |
| `GSI1_PK` / `GSI1_SK` | String | `QR#{status}` / 作成日時等のソートキー |
| `GSI2_PK` / `GSI2_SK` | String | `SHOP#{shopId}` / 作成日時等のソートキー |

---

## 2. 各データ構造の詳細（Order, Chat）

**2.4 Order (受取人による配送先・注文詳細)**
| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` / `SK` | String | `QR#{uuid}` / `ORDER` |
| `name` / `address` | String | 受取人氏名 / 配送先の完全な住所 |
| `zipCode` / `preferredDate`| String | 郵便番号 / 配達希望日付 |
| `preferredTime` / `phone`| String | 配達希望時間帯 / 受取人の電話番号 |
| `delivery_company` / `tracking_number`| String | 発送業者の名称 / 荷物の伝票番号・追跡番号 |

**2.5 Chat (チャット履歴)**
| 属性名 | 型 | 説明 |
| --- | --- | --- |
| `PK` / `SK` | String | `QR#{uuid}` / `CHAT` |
| `messages` | Array | チャット本文の配列 |
| `notification_emails` | StringSet | 新着通知の設定先メールリスト |
| `email_preferences` | Map | メール通知の設定情報マップ |

---

## 2.6 レコードが保持可能な状態 (ステータス) 一覧

**QR Metadata のステータス (`status`)**
* **`UNASSIGNED` (未連携)**: 生成されましたが、まだショップや商品と紐付けられていません。
* **`LINKED` (連携済み)**: 紐付けられましたが、まだ有効化されていません。
* **`ACTIVE` (有効化済み)**: ギフトとして贈ることができる状態です。
* **`USED` (発送待ち)**: 受取人が住所を入力し、発送待ちの状態です。
* **`SHIPPED` (発送済み)**: ショップが商品を発送し、追跡番号が登録された状態。
* **`COMPLETED` (受取り完了)**: 取引が正常に完了しました。
* **`EXPIRED` (期限切れ)**: 有効期限が切れ、ギフトが無効になった状態です。
* **`BANNED` (BAN済み)**: システム管理者が利用停止させた状態です。

**Product のステータス (`status`)**
* **`ACTIVE` (販売中・有効)**: 新しいQRコードに紐付けることが可能な状態です。
* **`STOPPED` (受注停止)**: 新規のQRコードへの紐付け一覧には表示されなくなります。

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
   - 注文一覧の取得: `QueryCommand` (GSI2 使用で特定のショップのQR) + `BatchGetCommand`
   - 発送ステータスへの更新: `UpdateCommand`

---

# 4. DynamoDB データ設計ガイド

## 1. DynamoDBとは？
AWSが提供する**NoSQL型（非リレーショナル）のデータベース**です。「大量のアクセスがあってもどんなデータでも一瞬で取り出せる」ことに特化しています。
* **PK (Partition Key / パーティションキー)**: データが入っている「大きな箱」の名前。
* **SK (Sort Key / ソートキー)**: 箱の中にある「個々の書類」の名前。

## 2. 「シングルテーブル設計」という考え方
「全く形の違うデータでも、工夫して全部1つの巨大なテーブルに突っ込む」という特殊な設計です。本プロジェクトも `MeishiGawariniTableV2` という1つのテーブルだけですべてのデータを管理しています。

---

## 3. このプロジェクトのデータの保存ルール（PKとSKの書き方）

* **① ショップの情報 (Shop)**: PK: `SHOP#<ショップのID>`, SK: `METADATA`
* **② 商品の情報 (Product)**: PK: `SHOP#<ショップのID>`, SK: `PRODUCT#<商品のID>`
  * PKに `SHOP#1234` を指定して検索するだけで、ショップ本体の情報と全ての商品を1回のリクエストで一気に取得できます。
* **③ QRコードの情報 (QR)**: PK: `QR#<QRのID>`, SK: `METADATA`
* **④ 注文・配送先の情報 (Order)**: PK: `QR#<QRのID>`, SK: `ORDER`
  * QRのIDをキーにするだけで、QR自体の情報と入力された送り先を一度に取り出せます。

---

## 4. GSI (グローバルセカンダリインデックス) について
PK以外の条件で検索したくなることを解決するための「裏口」が GSI です。

* **GSI1: 「状態や種類ごとの一覧」を見たいとき**
  * ステータスによる絞り込み検索で使われます。
  * `GSI1_PK`: `QR#UNASSIGNED`, `QR#ACTIVE`, `QR#USED`, `PRODUCT#ACTIVE` などのステータス値を保存。
* **GSI2: 「逆引き」や「所有者の検索」をしたいとき**
  * ショップのオーナー検索: `GSI2_PK` に `USER#<ユーザーID>` を保存。→ あるユーザーが持つ複数のショップを一発で探せます。
  * ショップに紐づくQRの検索: `GSI2_PK` に `SHOP#<ショップID>` を保存。→ そのショップ向けに発行された全QRのリストを一括で取得します。

---

# 5. 開発環境おまかせセットアップガイド（完全初心者向け）

## ステップ 1: 必要なソフトウェア（ツール）をインストールする
1. **Visual Studio Code (VS Code)**
2. **Git (ギット)**
3. **Node.js (ノード・ジェイエス)**: 「LTS (推奨版)」のボタンをクリック。
4. **AWS CLI**

## ステップ 3: プロジェクトのコードを自分のPCに持ってくる
```bash
git clone https://github.com/yudaiito9124-cyber/meishigawarini.git
cd meishigawarini
```

---

## ステップ 4: 必要なプログラム部品をダウンロードする
```bash
cd frontend
npm install

cd ../infra
npm install
```

## ステップ 5: 環境変数（秘密のパスワードなど）を設定する
`frontend` フォルダに `.env.local` を作り、指定された文字列を貼り付けてください。

## ステップ 6: 自分のPCでアプリの画面を動かしてみる！
```bash
cd ../frontend 
npm run dev
```
ブラウザを開き、`http://localhost:3000` にアクセスします。

---

## トラブルシューティング（よくあるエラーと解決法）

「`npm install` や `npm ci` でエラーが出る」「Amplifyのビルドが失敗する」場合、設定ファイルと実際のバージョンの間に不整合が生じることがあります。「関連ファイルを一度すべて削除し、ゼロから再インストール」することで解決します。

```bash
# Windows の場合 (PowerShell)
Remove-Item -Recurse -Force node_modules, package-lock.json

# Mac / Linux の場合
rm -rf node_modules package-lock.json
```

```bash
npm install
npm ci
```

---

# 6. セキュリティとコードの実装ガイド

## 1. 権限管理とエンドポイントの保護
* **① API全体のアクセス制限**: AWS Cognitoによる認証機能（Authorizer）をAPI Gatewayに設定。
* **② 管理者(Admin)権限の厳格なチェック**: `cognito:groups` をチェックし、「403 Forbidden」ではなく「404 Not Found」を返しています。悪意のあるユーザーにAPIが存在する事実すら悟らせないようにしています（ステルス化）。
* **③ データ所有権のチェック (Tenant Isolation)**: 「このショップの作成者と、今APIを叩いているユーザーが一致するか」を確認します。`owner_id` が `userId` と一致しない場合は `403 Forbidden` で処理を遮断します。

---

## 2. ブルートフォース（総当たり）攻撃対策
PINコードの入力時に「5回連続で失敗すると、そのQRコードを30分間ロック（操作不能）にする」という強力なレートリミット（回数制限）を設けています。

## 3. ファイルアップロードの安全性
「短時間（5分間）だけ有効な、特定のファイル名しかアップロードできない専用の片道切符（署名付きURL / Pre-signed URL）」を発行しています。画像ファイル以外のアップロードを許可せず、フロント側はこのURLに対してのみ直接画像を配置します。

---

## 4. トランザクション処理 (データの整合性担保)
「QRコードを【使用済】にする」処理と「住所情報を【注文データ】として保存する」処理は、絶対にセットで同時に行われなければなりません。DynamoDBの「トランザクション（TransactWriteCommand）」を使用しています。
`ConditionExpression: '#status = :active'` を指定し、同時に複数回「送信」ボタンを押されるようなレースコンディション（二重登録）もデータベースレベルで完全に弾いています。

## 5. インフラレベルの防御 (最小権限の原則 / IAM)
APIの役割ごとにプログラム（Lambda）を細かく分割し、それぞれに別々のIAM Role（権限）を割り当てています。
（例：`table.grantReadData(adminListFn)`, `bucket.grantPut(shopMgmtFn)`）

---

## 6. APIエラーの隠蔽化によるステルス化 (API Gateway)
API Gatewayで認証エラーや権限エラーが起きると、レスポンスを強制的に上書きし、一律で `404 Not Found` に偽装してフロントエンドに返却しています。

## 7. 強固なパスワードポリシー (Cognito)
* **パスワード強度**: 最低8文字以上、大文字、小文字、数字をすべて含むことを必須 (`require***: true`) としています。
* **MFA (二段階認証)**: オプションとして有効化できる設計（`mfa: cognito.Mfa.OPTIONAL`）になっています。

---

# 7. 画面一覧とページ遷移・操作ガイド

アプリケーションは大きく「一般・認証関連ページ」「ショップ管理者向けページ」「システム管理者向けページ」「受取人・エンドユーザー向けページ」の4つに分かれます。

## 1. 一般・認証関連ページ
* **a. トップページ (`/[locale]/`)**: ユーザーに対するサービスの簡単な説明を行うランディングページです。ログインページへの遷移、言語切り替え。
* **b. ログイン (`/[locale]/login`)**: Cognitoを利用した既存ユーザーのサインイン用ページ。サインイン処理実行。未確認ユーザーの自動遷移。新規登録ページへの遷移。
* **c. 新規登録 (`/[locale]/register`)**: 新規アカウント作成（サインアップ処理）、ログインページへの遷移。
* **d. アカウント認証 (`/[locale]/verify`)**: メールに届いた確認コード（検証コード）を入力してアカウント有効化。検証コードの入力とアカウント本登録（認証処理）。

---

## 2. ショップ管理者向けページ
* **a. ショップ一覧 (`/[locale]/shop`)**: 所有するショップの一覧表示と選択、新規ショップの作成、ログアウト処理。
* **b. 個別ショップ管理 (`/[locale]/shop/[shopId]`)**:
  * **商品の新規作成 (Create Product)**: 画像を選択した場合、システム内で自動的に規定比率（16:9等）へリサイズされ、S3へアップロードされます。
  * **商品一覧の閲覧とステータス管理**: ステータストグル機能 (`ACTIVE` ↔ `STOPPED`)。
  * **商品の削除**: `STOPPED` であり、かつ、QRコードが一つも紐づいていない場合のみ削除を実行できます。
  * **QRコードと商品の紐付け処理**: QRコードのスキャンまたは手入力。商品紐付けとアクティベート。一言メモの付与。
  * **受注 (Orders) の管理と発送手続き**: 受注一覧の表示とソート。絞り込み検索とリフレッシュ。受注詳細情報の確認。発送処理の実行 (Ship Order)。

---

## 3. システム管理者向けページ
* **a. システム管理ダッシュボード (`/[locale]/admin`)**: リンク直打ちでしかアクセスできない。
  * **QRコードの一括生成 (Batch Generate)**: 指定してバッチ処理を実行します。予め `shopId` と `productId` を紐付けた状態で発行することが可能です。
  * **印刷用PDFの生成とダウンロード**: QR画像とPINコードをレイアウトした「両面印刷用PDFファイル」を自動生成・ダウンロードします。過去バッチの再ダウンロード機能。
  * **QRコードのステータス別監視機能**: ステータス別一覧表示、個別検索機能 (`SEARCH`)。
  * **詳細確認と不正処理 (Ban)**: バン (`BANNED`) 処理により機能が完全に停止されます。単発QRの再ダウンロード、クリーンアップ実行。

---

## 4. 受取人・エンドユーザー向けページ
* **a. ギフト受取ページ (`/[locale]/receive/[uuid]`)**
  * **PIN入力ステップ**: PINの整合性がチェックされ、正しい場合のみ後続へ進行できます。
  * **パスワード認証解除ステップ (`RESTRICTED`状態)**: パスワード保護の制限を解除し商品情報が閲覧可能になります。
  * **ギフト情報の閲覧と配送先入力**: 情報がバックエンドへ安全に送信・保存され、ステータスが `USED` に移行します。
  * **配送待機ステップ**: ショップの発送手配をお待ちください待機案内画面。
  * **発送済み・追跡・受取報告ステップ**: 配送業者名と荷物の追跡番号が明示され、追跡システムへ遷移して状況を確認することが可能です。
  * **チャット連絡 / メール通知の購読設定**

---

# 8. 開発・デプロイ手順書（フロントエンド＆バックエンド）

## 1. フロントエンド（画面）の開発とデプロイ
* **ローカルサーバーを起動する**: `npm run dev` (`http://localhost:3000` にアクセス)
* **デプロイの手順**: GitHubの `main` ブランチにコードを統合（マージ）するだけで自動的にデプロイされます。AWS Amplifyが自動で最新のコードを読み取り反映されます。
  1. `git add .` -> `git commit -m` -> `git push origin 作業ブランチ名`
  2. GitHub上でPull Request (PR) を作成し、`main` にマージする

---

## 2. バックエンド（インフラ・API）の開発とデプロイ
バックエンドのプログラムを変更した場合、手元でコードの整合性をチェックします。`aws login` でAWS環境を操作するための権限を取得します。

* **コードをテスト・検証する**: `npx cdk synth` (コードをAWSが理解できるかチェック)
* **手元のコードの「差分」を確認する**: `npx cdk diff` (どこが追加され、どこが削除されるかが表示されます)
* **デプロイを実行する**: `npx cdk deploy`
  * 途中 `Do you wish to deploy these changes (y/n)?` と聞かれたら `y`。
  * ※バックエンドのデプロイによって APIのURL や CognitoのID などが新しくなった場合は、フロントエンド側の環境変数を新しい値に書き換える必要があります。
