# API Logging Guide

このドキュメントでは、API Gateway と Lambda Authorizer を活用したログ設定について解説します。
APIGatewayのログがCloudWatch Logsに保存されます。



## ログの確認方法(既に設定してあるので以下から確認できます)

#### ステージ環境
https://ap-northeast-1.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-1#logsV2:log-groups/log-group/default-meishigawarini-stg

#### 本番環境
https://ap-northeast-1.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-1#logsV2:log-groups/log-group/default-meishigawarini-prod

---

## 1. 実際に行ったログ設定の内容
API Gateway のアクセスログを有効にするに、以下の3つのステップを行いました。

### ステップ1：ログの「入れ物」を作る (CloudWatch)
1. CloudWatch コンソールの **[ロググループ]** を開きます。
2. **[ロググループを作成]** をクリックします。
3. 名前を入力（`default-meishigawarini-stg`, `default-meishigawarini-prod`）し、保持期間（Retention）を設定して作成します。(prod: 無限, stg: 2年)
4. 作成したグループの詳細画面から **ARN** をコピーしておきます。

### ステップ2：API Gateway に「書き込み権限」を与える (IAM)
API Gateway がログを書くための許可証が必要です。
1. IAM コンソールでロールを作成します。信頼されたエンティティは **API Gateway** を選択します。
2. 名前を `APIGatewayCloudWatchLogsRole` にして作成します。
3. 作成したロールの **ARN** をコピーします。
4. API Gateway コンソールの左メニュー一番下にある **[Settings]** を開きます。
5. **CloudWatch log role ARN** にコピーしたロール ARN を貼り付けて保存します。

### ステップ3：API のステージでログを有効化する
1. API Gateway で対象の API を選び、左メニューの **[Stages (ステージ)]** をクリックします。
2. 対象のステージ（`prod`）を選択し、**[Logs/Tracing (ログ/トレース)]** タブを開いて **[Edit (編集)]** を押します。
3. **Custom Access Logging** を有効にします。
4. **Access Log Destination ARN**: ステップ1でコピーしたロググループの ARN を貼り付けます。
   - **注意**: 末尾に `: *` が付いている場合は、それを削除して貼り付けてください（例: `...log-group:name` まで）。
5. **Log Format**: 以下の JSON フォーマットを貼り付けました。
   - **注意**: 改行を含まない **1行** で貼り付ける必要があります。

### フォーマット (JSON)

```json
{
  "requestId": "$context.requestId",
  "ip": "$context.identity.sourceIp",
  "user": "$context.authorizer.principalId",
  "requestTime": "$context.requestTime",
  "httpMethod": "$context.httpMethod",
  "resourcePath": "$context.resourcePath",
  "status": "$context.status",
  "protocol": "$context.protocol",
  "responseLength": "$context.responseLength",
  "duration": "$context.responseLatency",
  "authError": "$context.authorizer.error",
  "integrationError": "$context.integration.error"
}
```
このJsonに使っている user は、ソースコード内のLambda Authorizerが設定しているものです．
ログに保存されるのは、API Gatewayが受け取ったリクエストと、Lambda 関数に実装している 各種Authorizer が返したレスポンスです。Lambda関数の実装については、infra/lambda/内にある receiveAuthorizer.ts, adminAuthorizer.ts, userAuthorizer.ts を参照してください。

### 主要項目の解説

| 項目 | 説明 |
| :--- | :--- |
| **`user`** | 今回導入したオーソライザーがセットする ID (`userId` や `receiver-uuid`) です。特定のユーザーの動きを追跡する際のキーになります。 |
| **`authError`** | オーソライザー自体がエラー（500系など）で失敗した場合の理由が記録されます。 |
| **`duration`** | 通信全体にかかった時間（ミリ秒）です。ボトルネック調査に有効です。 |
| **`status`** | HTTP ステータスコードです。403 (権限エラー) や 401 (認証エラー) を素早く見つけるために使います。 |

---

## 3. ログの調査方法 (CloudWatch Logs)

CloudWatch Logs Insights を使うと、特定ユーザーの行動を簡単に抽出できます。

### 特定ユーザー (principalId) の行動を抽出するクエリ例

```sql
fields @timestamp, httpMethod, resourcePath, status, duration
| filter user = "receiver-xxxx-xxxx"
| sort @timestamp desc
```

### 誰が 403 (アクセス拒否) になっているかを調査するクエリ例

```sql
fields @timestamp, user, httpMethod, resourcePath, status
| filter status = 403
| sort @timestamp desc
```

## 4. Lambda ログの読み方 (基礎)

Lambda 関数のログ（`/aws/lambda/関数名`）は、1つのリクエストが以下の 3ステップで構成されています。

-   **START**: 「今から処理を始めます」という合図。
-   **(中身)**: プログラム内の `console.log` などが出力されます。
-   **REPORT**: 「処理が終わりました。結果（時間やメモリ使用量）はこうでした」という集計報告。

トラブル調査の際は、特定の **RequestId** をコピーして検索（フィルタリング）することで、その 1回分のリクエストの流れだけを抽出して追うことができます。

## 5. オーソライザーによる principalId の分類

トラブルシューティングを容易にするため、各オーソライザーは拒否時にも具体的な ID をセットしています。

-   **`receiver-[uuid]`**: この特定の QR コードで PIN 間違いや BAN、ロックが発生している。
-   **`unidentified-receiver`**: そもそも UUID や PIN がヘッダーに欠けている。
-   **`invalid-token`**: Cognito トークンの形式が正しくない。
-   **`verification-failed` / `authorization-failed`**: オーソライザー内部の処理（DB接続など）でエラーが起きた。

---

## 6. 注意事項

-   **個人情報の扱い**: `principalId` にメールアドレスなどの機密情報を直接含めないよう、常に内部的な ID (`sub` や `uuid`) を使用してください。
-   **CloudWatch の料金**: アクセスログが大量になると CloudWatch Logs の保管コストがかかるため、必要に応じてログ保持期間（Retention）を設定してください。
