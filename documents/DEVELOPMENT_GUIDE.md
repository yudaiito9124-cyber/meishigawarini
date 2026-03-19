# 開発・設計ガイド (Development & Design Guide)

このプロジェクトにおける、フロントエンドからバックエンドまでの処理の流れと、APIを追加するための具体的な手順をまとめます。

## 1. 処理の流れとディレクトリ構成

リクエストは常に以下の順序で処理され、各レイヤーで命名規則が同期されています。

1.  **Frontend API Client** (`frontend/lib/api/admin.ts`)
    - `adminApi` プロキシ経由でメソッドを呼び出します。
2.  **Infra / CDK** (`infra/lib/constructs/admin-api.ts`)
    - API Gatewayのパス定義と、Lambda関数へのルーティング、権限付与を行います。
3.  **Lambda Function** (`infra/lambda/admin_*.ts`)
    - 各エンドポイントに対応した個別のビジネスロジックを実行します。

---

## 2. 命名規則とパスの自動マッピング

- **ルール**: フロントエンド・Lambdaのメソッド名に含まれるアンダースコア（`_`）が、APIのURLパスにおけるスラッシュ（`/`）に対応しています。
- **対応例**:
  - **フロントエンドメソッド名**: `admin_qr_generate`
  - **APIのURLパス**: `/admin/qr/generate`
  - **Lambdaファイル名**: `admin_qr_generate.ts`

---

## 3. API（Lambda関数）追加の具体的手順

新しいAdmin APIを追加する際は、以下の4つのステップを順に実行してください。

### Step 1: Lambda関数の作成
`infra/lambda/` 内に `admin_*.ts` という名前でファイルを作成します。記述時には以下の2点を遵守してください。
- **ファイル名**: `admin_` から始めて、アンダースコア区切りでファイルを作成する。このファイル名がそのままAPIのパスになります。
- **JSDocヘッダー**: ファイル冒頭に概要、詳細、エンドポイント、リクエストボディの仕様を明記する。
- **DB操作コメント**: `ddb.send` 等の操作箇所に、検索条件(PK/SK/GSI)や操作対象カラムを具体的に記述する。

### Step 2: CDKでのルーティング定義
`infra/lib/constructs/admin-api.ts` を開き、以下の定義を追加します。
- `lampath` を使用して新しいLambda関数を定義。
- `grantTablePermissions` 等で必要なリソースへのアクセス権を付与。
- `adminResource.addResource(...)` を使用してAPI GatewayのパスとLambdaを紐付ける。
- `POST` メソッドのみを使用する。

### Step 3: フロントエンド型定義の更新
`frontend/lib/api/admin.ts` 内の `AdminApiSchema` に、新しいメソッド名とリクエストパラメータの型を追加します。
```typescript
type AdminApiSchema = {
    // 例: admin_qr_newaction を追加
    admin_qr_newaction: { uuid: string; option: boolean };
};
```

### Step 4: フロントエンドからの呼び出し
任意のコンポーネント内で `adminApi` を使用して呼び出します。
```typescript
import { adminApi } from '@/lib/api/admin';

await adminApi.admin_qr_newaction({ uuid: '...', option: true });
```



これにより、自動的にパス解決と型チェックが適用されます。
