# 開発導入・コーディングレシピ (Practical Development Recipes) - Backend

## 役割 (Role)
本ドキュメントは、プロジェクトに参加した開発者が「実際にどのようにコードを書き、変数を扱い、ロジックを組むか」を、既存のコード例をベースに習得するためのガイドです。

> [!NOTE]
> 命名規則の基本理念やドキュメント戦略などのプロジェクト共通基準については、以下のガイドを事前に確認してください。
> 👉 **[開発者導入・操作ガイド (ATFIRST_DEVELOPER_GUIDE.md)](./ATFIRST_DEVELOPER_GUIDE.md#6-共通開発基準-common-development-standards)**

---

## 0. バックエンド開発基準 (Backend Standards)

実機の実装に入る前に、バックエンド特有の規約を確認してください。

### 0.1 命名規則とパスのマッピング
- **API・Lambda 関連の命名**:
    - Lambda 関数名やファイル名、フロントエンドの API メソッド名は `snake_case` で統一します。
    - **重要**: アンダースコア（`_`）が URL パスのスラッシュ（`/`）に対応します。
    - 詳細なマッピング規則については **[API Gateway 実装ガイド (SPEC_HOW_TO_DEVELOP_API_GW.md)](./SPEC_HOW_TO_DEVELOP_API_GW.md#4-フラットなアクションベースのルーティング設計)** を参照してください。
- **変数・属性の命名 (snake_case の統一基準)**:
    - 原則として、APIペイロードおよびDynamoDB内部属性（Database）の両方で `snake_case` を使用します。
    - **特記事項 (移行互換性)**:
        - 過去の経緯により、一部の属性（`zipCode`, `preferredDate`, `preferredTime`）が `camelCase` で保存されている可能性があります。
        - 読み取りロジック（`shop_orders.ts`, `admin_qr_list.ts` 等）では、これら両方の命名形式を許容する「二重読み込み（Dual-Read）」を実装し、互換性を維持してください。

### 0.2 コーディング規約 (Backend Logic)
- **DB 操作の明確化**: `ddb.send` 等の操作箇所には、目的、テーブル、キー(PK/SK)、GSI、取得・更新カラムをコメントとして具体的に記述してください。
- **バリデーション**: 入力値のバリデーションを Lambda の冒頭で行い、不正なリクエストには適切なエラーレスポンスを返してください。参照：[標準的なハンドラーの構成](#11-標準的なハンドラーの構成-exhaustive-sample)

### 0.3 ID 生成規則 (ID Generation Strategy)
プロジェクト内のほぼ全てのデータ（ショップ、商品、QRコード、カード発注等）のIDは、以下の独自アルゴリズムを使用して生成します。

- **実装箇所**: [`infra/lambda/utils/id.ts`](../infra/lambda/utils/id.ts) の `generateId()` 関数
- **フォーマット**: `{UTCタイムスタンプ}{ランダム英小文字3文字}-{UUID}`
    - 例: `20240408103000abc-123e4567-e89b-12d3-a456-426614174000`
- **設計意図**:
    - **視認性**: IDの先頭を見るだけで、そのデータがいつ作成されたかを即座に判別可能にします。
    - **ソート順**: ID順で並び替えた際に、作成日時順に並ぶ性質を持ちます（DynamoDBのSK等で有用）。
    - **衝突回避**: タイムスタンプとランダム文字列に加え、UUIDを結合することで、高頻度な生成時でも一意性を完全に保証します。

---

## 1. バックエンドの実装サンプル (Backend: Lambda & DynamoDB)

バックエンドは、単一の責務を持つ Lambda 関数として実装されます。

### 1.1 標準的なハンドラーの構成 (Exhaustive Sample)
以下は、ショップ情報を更新する標準的なハンドラーの例です。各行の「意図」に注目してください。

```typescript
/**
 * @file shop_example_action.ts
 * @role ショップ用：サンプルアクションハンドラー
 * @responsibility
 *  - 特定の属性のバリデーションと更新を実行します。
 *  - 実行者の権限を検証し、マルチテナント性を保証します。
 */

import { APIGatewayProxyHandler } from 'aws-lambda'; // [External] AWS Lambda 標準型定義
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'; // [External] AWS SDK v3 DynamoDB 操作用
import { checkShopOwnerOrGM } from './share/shop-auth'; // [Project Specific] ショップ権限の共通検証ロジック
import { successResponse, errorResponse } from './utils/response'; // [Project Specific] API標準レスポンスフォーマット
import { ddb, TABLE_NAME } from './share/db'; // [Project Specific] DB クライアントとテーブル名参照
import { getShopId, getUserId, getAction } from './utils/request'; // [Project Specific] リクエストからのパラメータ抽出
import { ShopApiSchema } from '@shared/api-types'; // [Project Specific] 共通 API 型定義 (Single Source of Truth)

export const handler: APIGatewayProxyHandler = async (event) => {
    try {
        // [1] CORS対応: ブラウザからの OPTIONS リクエストには即座に成功を返します。
        if (event.httpMethod === 'OPTIONS') return successResponse();

        // [2] コンテキスト抽出: JSON body または ヘッダー(ID Token) から必要な変数を取得します。
        const body = JSON.parse(event.body || '{}');
        const userId = getUserId(event); // Lambda Authorizer が付与したユーザーID
        const shopId = getShopId(event, body); // 操作対象のショップID

        // [3] 入力検証: 必須項目が欠けている場合は早期リターン (Fail Fast)。
        if (!shopId) return errorResponse(400, 'Missing shopId');
        if (!userId) return errorResponse(401, 'Unauthorized');

        // [4] 権限検証: 「そのユーザーが、そのショップを操作して良いか」を DB で照合します。
        // checkShopOwnerOrGM は内部的に最新のショップ情報を返すため、データの参照にも使えます。
        const shopMetadata = await checkShopOwnerOrGM(ddb, TABLE_NAME, shopId, userId, event);
        if (!shopMetadata) return errorResponse(403, 'Forbidden');

        // [5] メインロジック: DynamoDB へのアクション。
        // ※必ずテーブル操作の箇所には、PK/SK の役割と目的をコメントしてください。
        
        // 【DB操作: UpdateItem】
        // PK: SHOP#{shopId} (対象テナント)
        // SK: METADATA (メタデータレコード)
        // 目的: 特定のフィールド (例: name) を部分更新します。
        await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { 
                PK: `SHOP#${shopId}`, 
                SK: 'METADATA' 
            },
            UpdateExpression: 'SET #name = :name, ts_updated_at = :now',
            ExpressionAttributeNames: { 
                '#name': 'name' // 予約語回避のためのエイリアス
            },
            ExpressionAttributeValues: { 
                ':name': body.name,
                ':now': new Date().toISOString() // 更新日時の付与
            }
        }));

        // [6] レスポンス: API 契約に基づいた成功メッセージを返します。
        return successResponse({ message: 'Updated successfully' });

    } catch (error: any) {
        // [7] 最終トラップ: 予期せぬエラーは適切にログ出力し、500系を返します。
        console.error('Handler Error:', error);
        return errorResponse(500, 'Internal Server Error', error.message);
    }
};
```

---

## 3. 重要ドキュメントへのポータル索引

実装に迷ったら、以下の「真実」へ立ち戻ってください。

- **[共通開発基準 (ATFIRST_DEVELOPER_GUIDE.md)](./ATFIRST_DEVELOPER_GUIDE.md#6-共通開発基準-common-development-standards)**
    - 命名規則の基本理念、ドキュメント戦略、PRルールなど。
- **[データの真実：共有 API 型定義 (shared/api-types.ts)](../shared/api-types.ts)**
    - フロントとバックエンドが交わす「契約」としてのデータ型。
- **[インフラの真実：DynamoDB 設計 (SPEC_INFRA_DYNAMODB.md)](./SPEC_INFRA_DYNAMODB.md)**
    - PK/SK の意味合い、GSI の引き方など。
- **[作法：AI Etiquette (ATFIRST_AI_ETIQUETTE.md)](./ATFIRST_AI_ETIQUETTE.md)**
    - 高密度なドキュメンテーションと、 lossless な編集の哲学。

---

## 4. チェックリスト：デプロイ前に確認すること

実装が完了したら、以下の「実機の真実」を確認してください。

1.  [ ] **`npx tsc --noEmit`** を実行し、フロントエンドに型エラーがないか？
2.  [ ] **バックエンドの各関数冒頭**に、適切な File Header コメントはあるか？
3.  [ ] **DB操作箇所**に、PK/SK の役割説明コメントがあるか？
4.  [ ] **`any` 型**を放置していないか？
