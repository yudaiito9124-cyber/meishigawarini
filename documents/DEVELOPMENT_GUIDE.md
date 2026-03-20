# 開発・設計ガイド (Development & Design Guide)

このプロジェクトにおける、フロントエンドからバックエンドまでの処理の流れと、APIを追加するための具体的な手順をまとめます。

## 1. 処理の流れとディレクトリ構成

リクエストは常に以下の順序で処理され、各レイヤーで命名規則が同期されています。

1.  **Frontend API Client** (`frontend/lib/api/*.ts`)
    - `adminApi`, `shopApi`, `receiveApi` 等のプロキシ経由でメソッドを呼び出します。
2.  **Infra / CDK** (`infra/lib/constructs/*-api.ts`)
    - API Gatewayのパス定義と、Lambda関数へのルーティング、権限付与を行います。
3.  **Lambda Function** (`infra/lambda/*.ts`)
    - 各エンドポイントに対応した個別のビジネスロジックを実行します。

---

## 2. 命名規則とパスの自動マッピング

- **ルール**: フロントエンド・Lambdaのメソッド名に含まれるアンダースコア（`_`）が、APIのURLパスにおけるスラッシュ（`/`）に対応しています。
- **対応例**:
  - **フロントエンドメソッド名**: `shop_products_list`
  - **APIのURLパス**: `/shop/products/list`
  - **Lambdaファイル名**: `shop_products.ts` (※複数のアクションを1つのファイルで処理する場合もありますが、基本は1対1または機能集約です)

---

## 3. API（Lambda関数）追加の具体的手順

新しいAPIを追加する際は、以下のステップを順に実行してください。

### Step 1: Lambda関数の作成
`infra/lambda/` 内に適切な名前でファイルを作成します（例: `shop_newfeature.ts`）。
- **JSDocヘッダー**: ファイル冒頭に概要、詳細、エンドポイント、リクエストボディの仕様を明記する。
- **DB操作コメント**: `ddb.send` 等の操作箇所に、目的、テーブル、キー(PK/SK)、検索条件(GSI)、取得・更新カラムを具体的に記述する。

### Step 2: CDKでのルーティング定義
対応する `infra/lib/constructs/*-api.ts` を開き、以下の定義を追加します。
- `lampath` を使用して新しいLambda関数を定義。
- `grantTablePermissions` 等で必要なリソースへのアクセス権を付与。
- `.addResource(...)` を使用してAPI GatewayのパスとLambdaを紐付ける。
- 原則として **`POST` メソッドのみ**を使用し、Action-basedなURL設計にする。

### Step 3: フロントエンド型定義の更新
`frontend/lib/api/*.ts` 内の `*ApiSchema` に、新しいメソッド名とリクエストパラメータの型を追加します。
```typescript
type ShopApiSchema = {
    shop_products_newaction: { shopId: string; option: boolean };
};
```

### Step 4: フロントエンドからの呼び出し
任意のコンポーネント内で対応する `*Api` を使用して呼び出します。
```typescript
import { shopApi } from '@/lib/api/shop';

await shopApi.shop_products_newaction({ shopId: '...', option: true });
```



これにより、自動的にパス解決と型チェックが適用されます。
