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

## 3. Cognito認証（Authorizer）との連携
「ショップオーナー」や「管理者」のみが実行できるAPIを守るために、Cognito User Poolを利用したオーソライザーを設定しています。

```typescript
import * as cognito from 'aws-cdk-lib/aws-cognito';

// UserPoolの参照（事前に定義されているもの）
// const userPool = new cognito.UserPool(...);

// API Gateway用のCognito Authorizerを作成
const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'ShopAuthorizer', {
  cognitoUserPools: [userPool],
});
```

---

## 4. ルーティングとLambdaの統合 (リソースとメソッドの追加)
APIのURLパス（リソース）を作成し、それぞれにHTTPメソッド（GET, POSTなど）と、実行するLambda関数を紐付けます。

### ① 認証が不要なAPI（一般ユーザー向け）
QRコード受け取り画面など、誰でもアクセスできるAPIの定義例です。

```typescript
// 1. URLパスを作成: /recipient/submit
const recipientResource = api.root.addResource('recipient');
const submitResource = recipientResource.addResource('submit');

// 2. メソッドを追加してLambda(recipientSubmitFn)と統合
submitResource.addMethod('POST', new apigateway.LambdaIntegration(recipientSubmitFn));
```

### ② 認証が必要なAPI（管理者・オーナー向け）
ショップ管理など、ログイン必須のAPIには `authorizer` をアタッチします。
リクエストヘッダーに有効なCognitoのToken（IdTokenなど）が含まれていない場合、Lambdaは実行されません（401エラーになります）。

```typescript
// 1. URLパスを作成: /shop/{shopId}/products
const shopResource = api.root.addResource('shop');
const shopIdResource = shopResource.addResource('{shopId}');
const productsResource = shopIdResource.addResource('products');

// 2. メソッドを追加し、Authorizerを設定
productsResource.addMethod('POST', new apigateway.LambdaIntegration(shopMgmtFn), {
  authorizer, // Cognito Authorizerの適用
  authorizationType: apigateway.AuthorizationType.COGNITO // 認証タイプを指定
});
```

### 💡 パスパラメータ（`{shopId}` など）の利用
URLの中に `{shopId}` のように中括弧を含めることで、動的な変数をLambdaに渡すことができます。
Lambda側では `event.pathParameters.shopId` としてこれを受け取ります。
