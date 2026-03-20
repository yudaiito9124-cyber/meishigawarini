# API Gateway 実装ガイド

このプロジェクトにおけるAPIの入り口である「**Amazon API Gateway**」について、基本的な役割とプロジェクト内（CDK）での実装方法を解説します。

---

## 1. API Gatewayとは？
フロントエンド（React/Next.jsなど）からのHTTPリクエスト（GET, POSTなど）を受け取り、適切なバックエンド処理（Lambda関数）へ振り分ける「受付窓口」の役割を果たします。

このプロジェクトでは、主に以下の3つの機能をAPI Gatewayで設定しています。
1. **ルーティング**: URLパスパス（例: `/shop`, `/admin`）に応じたLambdaの呼び出し
2. **CORS設定**: フロントエンド（異なるドメイン）からの安全なアクセス許可
3. **認証 (Authorizer)**: ログイン済みユーザー（Cognito）のみアクセスできるルートの保護

---

## 2. API Gatewayの基本構成とCORS設定
[`infra/lib/infra-stack.ts`](../infra/lib/infra-stack.ts) にて定義されています。
デフォルトでCORSのPreflightリクエスト（`OPTIONS`）に応答する設定が行われています。

```typescript
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

// API Gateway本体の定義とデフォルトCORS設定
const allowedOrigins = ['https://meishigawarini.com', 'http://localhost:3000'];

const api = new apigateway.RestApi(this, 'MeishiGawariniApi', {
  restApiName: 'MeishiGawarini Service',
  defaultCorsPreflightOptions: {
    allowOrigins: allowedOrigins,
    allowMethods: apigateway.Cors.ALL_METHODS,
    allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
  },
});
```

### 特殊なCORSエラー対策（Gateway Responses）
認証エラー（401）などでLambdaに到達する前にAPI Gatewayがエラーを返す場合、デフォルトではCORSヘッダーが付与されず、フロントエンドで原因不明のCORSエラーになります。これを防ぐためにレスポンスをカスタマイズしています。

```typescript
// --- 認証エラー(401)を 404 に偽装しつつ CORS を許可 ---
// セキュリティ上、APIの存在自体を隠蔽するため404を返しています
api.addGatewayResponse('Default401Response', {
  type: apigateway.ResponseType.UNAUTHORIZED,
  statusCode: '404',
  responseParameters: {
    'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
    'gatewayresponse.header.Access-Control-Allow-Headers': "'*'",
    'gatewayresponse.header.Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS,PATCH'",
  },
  templates: {
    'application/json': '{"message": "Not Found."}'
  }
} as any);
```

---

## 3. 認証 (Authorizer) との連携
本プロジェクトでは、セキュリティ要件（MFAの強制やカスタム権限チェック等）を満たすため、標準のCognito Authorizerではなく、**Custom Lambda Authorizer (`RequestAuthorizer`)** を採用しています。

*   **ShopAuthorizer**: `Authorization` ヘッダーを受け取り、JWT検証・グループチェック・MFA認証済みかを確認します。
*   **ReceiveAuthorizer**: `X-QR-UUID` および `X-QR-PIN` ヘッダーを受け取り、QRの有効性と所有権を動的に検証します。

```typescript
// Shop/Admin用 Authorizerの定義例 (cdk)
const authorizer = new apigateway.RequestAuthorizer(this, 'ShopAuthorizer', {
  handler: shopAuthFn,
  identitySources: [apigateway.IdentitySource.header('Authorization')],
});
```

---

## 4. フラットなアクションベースのルーティング設計
以前の設計（RESTfulなパスパラメータ `/shop/{id}/...`）から、**フラットなアクションベースのPOSTエンドポイント**へ移行しました。

### メリット
- APIパスが単純明快になり、フロントエンドからの呼び出し(`fetch_post`)が統一できる。
- パスパラメータのパースミスや、CORSのワイルドカード問題（サブパスの網羅漏れ）を回避できる。
- 全てのアクションを `POST` で統一することで、パラメータの隠蔽性が向上する。

### 実装例
各リソースに対して具体的なアクション（`list`, `create`, `get`, `update` 等）をサブパスとして定義し、Lambda関数を統合します。

```typescript
// /shop/products 例
const productsResource = shopResource.addResource('products'); 

// 全て POST メソッドで、パスによりアクションを明示
productsResource.addResource('list').addMethod('POST', integration, routeOptions);
productsResource.addResource('create').addMethod('POST', integration, routeOptions);
productsResource.addResource('update').addMethod('POST', integration, routeOptions);
```

### 💡 パラメータの渡し方
パスパラメータ（`{shopId}`）は使用せず、リクエストボディ（JSON）に含めて送信します。
- **リクエスト**: `POST /shop/products/list`  Body: `{"shopId": "..."}`
- **Lambda側**: `JSON.parse(event.body).shopId` で取得します。
- **Action判別**: 1つのLambdaで複数パスを処理する場合、`event.resource` を見てパスの末尾（`/list` 等）から処理を振り分けます。
