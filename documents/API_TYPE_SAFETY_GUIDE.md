# API静的型安全ガイド (API Type Safety Guide)

このプロジェクトでは、フロントエンドとバックエンドのAPI不整合を **「実際に通信することなく、ビルド時の型チェックで機械的に検知」** する仕組みを採用しています。

## 1. 仕組みの概要

プロジェクトルートにある [shared/api-types.ts](file:///Users/yudai/git/meishigawarini/shared/api-types.ts) が「唯一の真実（Source of Truth）」です。
フロントエンドのAPIクライアントと、バックエンドのLambda関数がこの同じ定義を参照することで、双方向の整合性を保証します。

## 2. API追加・変更の手順

### Step 1: 共有型の更新
[shared/api-types.ts](file:///Users/yudai/git/meishigawarini/shared/api-types.ts) 内の適切なSchemaに、リクエストボディなどの型定義を追加します。

```typescript
export type ShopApiSchema = {
    shop_new_feature: { param1: string; param2: number };
};
```

### Step 2: Lambda関数への適用
Lambda関数の冒頭で、定義した型を使って `body` をキャストします。

```typescript
import { ShopApiSchema } from '@shared/api-types';

// ... handler内 ...
const body = JSON.parse(event.body || '{}') as ShopApiSchema['shop_new_feature'];
```

### Step 3: フロントエンドでの利用
フロントエンドのAPIクライアントは自動的にこの定義を読み込むため、メソッドを呼び出す際に型補完とチェックが働きます。

```typescript
await shopApi.shop_new_feature({ param1: "test", param2: 123 }); // 型安全！
```

## 3. 整合性の一括チェック方法

開発時やデプロイ前に、以下のコマンドを実行することで、全APIの整合性を機械的にチェックできます。

### フロントエンドのチェック
```bash
cd frontend
npx tsc --noEmit
```

### バックエンド（Infra）のチェック
```bash
cd infra
npx tsc --noEmit
```

> [!TIP]
> もし型定義名（`shop_new_feature`）のタイポや、パラメータ名（`param1`）の相違がある場合、これらのコマンドを実行した際に即座にコンパイルエラーとして検出されます。

## 4. この方法で防げるミスの例

- **属性名の変更漏れ**: 片方だけ名前を変えて、もう片方を直し忘れた。
- **型の不一致**: フロントは「数値」を送っているが、バックは「文字列」を期待している。
- **スペルミス**: APIアクション名をタイピングミスした。
