# DynamoDB データ設計ガイド

このプロジェクトのデータベースである「**Amazon DynamoDB**」について、基本的な考え方から、実際のプロジェクトでどのようにデータを保存しているかまでを初心者向けに解説します。

---

## 1. DynamoDBとは？
DynamoDBは、AWSが提供する**NoSQL型（非リレーショナル）のデータベース**です。
Excelのような「綺麗な表の形」でデータを管理する一般的なデータベース（MySQLなど）とは異なり、**「大量のアクセスがあってもどんなデータでも一瞬で取り出せる」**ことに特化しています。

### 最大の特徴：キーとバリュー
DynamoDBでは、データを引き出すための「カギ（Key）」と、そこに入っている「中身（Value）」がセットになっています。
このプロジェクトでは、主に以下の2つのカギを組み合わせてデータを特定します。

*   **PK (Partition Key / パーティションキー)**: データが入っている「大きな箱」の名前。
*   **SK (Sort Key / ソートキー)**: 箱の中にある「個々の書類」の名前。

---

## 2. 「シングルテーブル設計」という考え方
一般的なデータベースでは、「ショップ一覧の表」「商品一覧の表」「注文一覧の表」のように、データごとに別々の表（テーブル）を作ります。

しかし、DynamoDBを最速・最安で使うためのベストプラクティスとして**「シングルテーブル設計（Single Table Design）」**という手法があります。
これは**「全く形の違うデータでも、工夫して全部1つの巨大なテーブルに突っ込む」**という特殊な設計です。
本プロジェクトも `MeishiGawariniTableV2` という1つのテーブルだけですべてのデータを管理しています。
![table image](/documents/data/image-table.png)
**[実際のデータの例はこちら](/documents/data/sampletabledata.csv)**

---

## 3. このプロジェクトのデータの保存ルール（PKとSKの書き方）

1つのテーブルに色々なデータを混在させるため、PKとSKの「名前の付け方」でデータを分類しています。プロジェクトのコード（[`infra/lambda/`](../infra/lambda/) の中身）で実際に使われているルールを紹介します。

### 🏢 ① ショップの情報 (Shop)
*   **PK**: `SHOP#<ショップのID>` (例: `SHOP#1234-abcd`)
*   **SK**: `METADATA`
*   **中身**: ショップ名、オーナーのメールアドレス、作成日時など

### 📦 ② 商品の情報 (Product)
「この商品がどのショップのものか」を素早く検索できるように、PKを親（ショップ）と同じにしています。
*   **PK**: `SHOP#<ショップのID>`
*   **SK**: `PRODUCT#<商品のID>`
*   **中身**: 商品名、価格、画像URL、有効期限など
> **メリット**: PKに `SHOP#1234` を指定して検索するだけで、ショップ本体の情報(`METADATA`)と、そのショップが持つ全ての商品(`PRODUCT#...`)を1回のリクエストで一気に取得できます。

### 🏷️ ③ QRコードの情報 (QR)
*   **PK**: `QR#<QRのID>` (例: `QR#8888-9999`)
*   **SK**: `METADATA`
*   **中身**: PINコード、ステータス（未使用/リンク済/使用済）、リンク先のショップID・商品IDなど

### 🚚 ④ 注文・配送先の情報 (Order)
QRコードを読み取ったユーザーが住所を入力すると、そのQRコードと同じ箱（PK）の中に「注文情報」として保存されます。
*   **PK**: `QR#<QRのID>`
*   **SK**: `ORDER`
*   **中身**: 受取人の名前、住所、郵便番号、希望配達日時など
> **メリット**: QRのIDをキーにするだけで、QR自体の情報（`METADATA`）と、入力された送り先（`ORDER`）を一度に取り出せます。

---

## 4. GSI (グローバルセカンダリインデックス) について

「PKで検索するのが一番速い」のがDynamoDBのルールですが、「ステータスが "ACTIVE" のQRを全部探したい」「自分が持っているショップを一覧で見たい」など、**PK以外の条件で検索したくなる**ことがあります。

これを解決するための「裏口（別の切り口の検索用カギ）」が **GSI** です。
このプロジェクトでは2つのGSIを用意しています。

### GSI1: 「状態や種類ごとの一覧」を見たいとき
ステータスによる絞り込み検索で使われます。
*   **GSI1_PK**: `QR#UNASSIGNED`, `QR#ACTIVE`, `QR#USED`, `PRODUCT#ACTIVE` などのステータス値を保存。
*   *(例: 管理画面で「未発送（USED）」のQRをズラッと一覧表示する時などに使います)*

### GSI2: 「逆引き」や「所有者の検索」をしたいとき
*   **ショップのオーナー検索**: `GSI2_PK` に `USER#<ユーザーID>` を保存。→ あるユーザーが持つ複数のショップを一発で探せます。
*   **ショップに紐づくQRの検索**: `GSI2_PK` に `SHOP#<ショップID>` を保存。→ そのショップ向けに発行された全QRのリストを一発で取得します。

---

## 5. 開発時の確認方法
実際のデータがどう入っているかイメージしにくい場合は、AWS マネジメントコンソールが便利です。

1. AWSコンソールで **「DynamoDB」** を検索。
2. 左メニューの **「テーブル」**（または **「項目を探索」**）を開く。
3. `MeishiGawariniTableV2` を選択すると、エクセルのような画面で「実際のPKやSKにどんな文字が入っているか」を直接見ることができます。

---

## 6. 実装コードのサンプル

このプロジェクトのバックエンド（[`infra/lambda/`](../infra/lambda/)）やインフラ定義（[`infra/lib/`](../infra/lib/)）で実際に使用されているコードの抜粋です。

### ① DynamoDBへのデータ追加・更新 (PutCommand)
`PutCommand`を使用して、新しいアイテムを作成したり、既存のアイテムを丸ごと上書きします。
([`shop-mgmt.ts`](../infra/lambda/shop-mgmt.ts) より抜粋)

```typescript
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const now = new Date().toISOString();
await ddb.send(new PutCommand({
    TableName: process.env.TABLE_NAME,
    Item: {
        PK: `SHOP#${shopId}`,
        SK: `PRODUCT#${productId}`,
        name: "商品名",
        price: 1500,
        status: 'ACTIVE',
        ts_created_at: now
    }
}));
```

### ② DynamoDBからのデータ読み取り (GetCommand / QueryCommand)
PKとSKが完全にわかっている場合は `GetCommand` が最速です。特定の条件に合致する複数アイテムの一覧を取りたい場合は `QueryCommand` を使用します。

**GetCommandの例 (1件取得):**
```typescript
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const getRes = await ddb.send(new GetCommand({
    TableName: process.env.TABLE_NAME,
    Key: { PK: `SHOP#${shopId}`, SK: 'METADATA' }
}));

console.log(getRes.Item); // 取得したデータ
console.log(getRes.Item.owner_id); // 検索に合致したデータのowner_id
```

**QueryCommandの例 (一覧取得):**
```typescript
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const res = await ddb.send(new QueryCommand({
    TableName: process.env.TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
        ':pk': `SHOP#${shopId}`,
        ':sk': 'PRODUCT#'
    }
}));

console.log(res.Items); // 検索に合致したデータの配列
console.log(res.Items[0].owner_id); // 検索に合致したデータの配列の最初の要素のowner_id
```

### ③ CDKでのDynamoDBの権限付与 (IAMロール)
Lambda関数がDynamoDBを読み書きできるようにするには、CDK（インフラ構築コード）側で権限（IAM）を設定する必要があります。
([`infra-stack.ts`](../infra/lib/infra-stack.ts) より抜粋)

```typescript
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';

// テーブルの定義
const table = new dynamodb.Table(this, 'MeishiGawariniTableV2', { /* 省略 */ });

// Lambda関数の定義
const shopMgmtFn = new nodejs.NodejsFunction(this, 'ShopMgmtFn', { /* 省略 */ });

// 読み書き権限をLambdaに付与する (Put, Get, Update, Deleteなどすべて可能)
table.grantReadWriteData(shopMgmtFn);

// もし読み取り専用権限だけを付与したい場合は以下のように記述します
// table.grantReadData(adminListFn);
```

### ④ CDKでのテーブル定義 (GSI含む)
`MeishiGawariniTableV2` テーブル本体とGSI（グローバルセカンダリインデックス）は以下のように定義されています。どんなデータ構造でも保存できるように、PKとSKは単純な「文字列型」として定義されています。
([`infra-stack.ts`](../infra/lib/infra-stack.ts) より抜粋)

```typescript
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

// DynamoDB Table本体の定義
const table = new dynamodb.Table(this, 'MeishiGawariniTableV2', {
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});

// GSI1: ステータス別の検索用インデックス
table.addGlobalSecondaryIndex({
  indexName: 'GSI1',
  partitionKey: { name: 'GSI1_PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'GSI1_SK', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
});

// GSI2: オーナーごとのショップ検索・ショップごとの商品/QR検索用
table.addGlobalSecondaryIndex({
  indexName: 'GSI2',
  partitionKey: { name: 'GSI2_PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'GSI2_SK', type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
});
```
