# セキュリティとコードの実装ガイド


---

## 1. 権限管理とエンドポイントの保護 (Cognito / API Gateway)

管理画面やショップ画面の裏側のAPIは、誰でも叩けないように保護されています。

### ① API全体のアクセス制限
*   **仕組み**: AWS Cognitoによる認証機能（Authorizer）をAPI Gatewayに設定しており、ログインしていないリクエストはAPI到達前にAWS側で弾かれます。
*   **場所**: `infra/lib/infra-stack.ts`
    *   API全体の定義時に `authorizer` を紐づけ、保護するパス（`/shop` や `/admin` など）を指定しています。

### ② 管理者(Admin)権限の厳格なチェック
*   **仕組み**: ログインしているだけでなく、「管理グループ（Administrators）」に入っているユーザーしか絶対にアクセスできないようにしています。
    特筆すべきは、**権限がない場合は「403 Forbidden（権限エラー）」を返すのではなく、「404 Not Found（見つからない）」を返している点**です。これにより、悪意のあるユーザーに「ここに管理用のAPIが存在する」という事実すら悟らせないようにしています（ステルス化）。
*   **場所**: `infra/lambda/share/admin-auth-inlambda.ts`
    *   `verifyAdmin` 関数で `cognito:groups` をチェックし、権限がなければ404レスポンスを生成して直ちに処理を終了させています。

### ③ データ所有権のチェック (Tenant Isolation)
*   **仕組み**: ショップオーナーが「他のショップのデータ」を勝手に書き換えたり盗み見たりできないように、APIアクセス時に必ず「このショップの作成者と、今APIを叩いているユーザーが一致するか」を確認します。
*   **場所**: `infra/lambda/shop-mgmt.ts`
    *   `verifyShopOwner` 関数でDBから対象ショップを取得し、`owner_id` が CognitoのユーザーID(`userId`) と一致しない場合は `403 Forbidden` で処理を遮断します。

---

## 2. ブルートフォース（総当たり）攻撃対策

受取人の画面では、QRコードを読み取った後に「8桁のPINコード」を入力します。このPINコードを何度も当てずっぽうに入力されるのを防ぐ仕組みです。

*   **仕組み**: PINコードの入力時に**「5回連続で失敗すると、そのQRコードを30分間ロック（操作不能）にする」**という強力なレートリミット（回数制限）を設けています。
*   **場所**: 
    1.  `infra/lambda/utils/rate-limit.ts`
        *   `isLocked` 関数で「現在ロックされている時間か」を計算し、`getRateLimitUpdate` で「失敗回数をカウントアップし、5回に達したら現在時刻の30分後を `locked_until` にセットする」DB更新用のコマンドを作成しています。
    2.  `infra/lambda/recipient-submit.ts` など（受取人向けAPI）
        *   リクエストが来た一番初めに `isLocked` を呼び出し、ロック中なら即座に `403 Forbidden` を返してPINの判定すら行いません。

---

## 3. ファイルアップロードの安全性

ショップオーナーが商品の画像をアップロードする際のセキュリティです。

*   **仕組み**: 直接S3（ストレージ）にアップロードさせたり、Lambda（サーバー）経由で画像を処理したりすると、悪意のある大容量ファイル（マルウェアなど）を送られてサーバーがパンクするリスクがあります。
    これを防ぐため、**「短時間（5分間）だけ有効な、特定のファイル名しかアップロードできない専用の片道切符（署名付きURL / Pre-signed URL）」** を発行しています。
*   **場所**: `infra/lambda/shop-mgmt.ts` (Get Upload URL 部分)
    *   リクエスト元の拡張子（jpg, png等）やMIMEタイプ（image/jpeg等）を厳格にチェック。
    *   画像ファイル以外のアップロードを許可せず、`getSignedUrl` で300秒だけ有効なURLを生成してフロントエンドに返します。フロント側はこのURLに対してのみ直接画像を安全に配置します。

---

## 4. トランザクション処理 (データの整合性担保)

*   **仕組み**: 受取人が住所を入力し「QRコードを【使用済】にする」処理と「住所情報を【注文データ】として保存する」処理は、**絶対にセットで同時に行われなければなりません。** もし片方だけが失敗すると、「住所は届いたのにQRは未使用のまま使い回せる」等の致命的なバグになります。これを防ぐため、DynamoDBの「トランザクション（TransactWriteCommand）」を使用しています。
*   **場所**: `infra/lambda/recipient-submit.ts`
    *   `TransactItems` の中で、QRステータスの `Update` と、オーダーの `Put` を配列で内包し、どちらかに少しでもイレギュラーがあれば通信全体をロールバック（無かったこと）にする堅牢な保護を行っています。さらに `ConditionExpression: '#status = :active'` を指定し、同時に複数回「送信」ボタンを押されるようなレースコンディション（二重登録）もデータベースレベルで完全に弾いています。

---

## 5. インフラレベルの防御 (最小権限の原則 / IAM)

AWS上に構築された各プログラム（Lambda関数）は、不要な操作ができないようにアクセス権限を最小限に絞っています。これを「最小権限の原則（Least Privilege）」と呼びます。

*   **仕組み**: APIの役割ごとにプログラム（Lambda）を細かく分割し、それぞれに「DBに書き込む権限」「DBから読み取る機能だけ」「ファイル(S3)を置く機能だけ」と別々のIAM Role（権限）を割り当てています。
    これにより、万が一、特定のAPIに脆弱性があり攻撃者に操作されたとしても、被害そのAPIが持つ最小限の権限の範囲に留まります。
*   **場所**: `infra/lib/infra-stack.ts`
    *   `table.grantReadData(adminListFn)`: 一覧表示APIには読み取り権限しか与えていないため、絶対にデータを削除できません。
    *   `bucket.grantPut(shopMgmtFn)`: 画像をアップロードするAPIにだけS3への書き込み権限を与えています。

---

## 6. APIエラーの隠蔽化によるステルス化 (API Gateway)

APIの設計上、攻撃者にバックエンドの仕組みを推測させないための工夫を施しています。

*   **仕組み**: 通常、API Gatewayで認証エラーや権限エラーが起きると、`401 Unauthorized` や `403 Forbidden` といったエラーが返ります。しかし、本プロジェクトではこれらのシステムエラーが発生した際、API Gatewayのレスポンスを強制的に上書きし、一律で `404 Not Found` に偽装してフロントエンドに返却しています。
*   **場所**: `infra/lib/infra-stack.ts`
    *   `api.addGatewayResponse('Default401Response', ... statusCode: '404')` という記述で、AWSレベルでのエラー応答をカスタマイズしています。

---

## 7. 強固なパスワードポリシーと多要素認証 (Cognito)

ショップオーナーや管理者が利用するアカウントは、AWSの世界標準レベルのセキュリティで保護されます。

*   **場所**: `infra/lib/infra-stack.ts` (`MeishiGawariniUserPool` の定義部分)
    *   **パスワード強度**: 最低8文字以上、大文字、小文字、数字をすべて含むことを必須 (`require***: true`) としています。
    *   **Cognito ティア**: WebAuthn（パスキー）対応を見据えて **Essentials** ティアを使用しています (`cfnUserPool.userPoolTier = 'ESSENTIALS'`)。
    *   **MFA設定**: MFA自体はCognito上では `OPTIONAL` 設定ですが、**管理者グループ (`Administrators` / `GlobalAdmins`) のメンバーに対しては、Lambda Authorizer がMFA完了を必須チェックする**ため、実際にはMFAなしでは管理APIへアクセスできません。

---

## 8. 管理者専用のMFA強制 (Lambda Authorizer)

管理APIは、Cognitoの通常認証に加えて、独自のLambda Authorizer (`infra/lambda/admin-authorizer.ts`) による二重チェックを行います。

*   **仕組み**:
    1.  JWTトークンを検証し、正規のCognitoユーザーであることを確認します。
    2.  `cognito:groups` クレームをチェックし、`Administrators` または `GlobalAdmins` グループに属しているかを確認します（いずれにも属していない場合はDeny）。
    3.  JWTの `amr` クレームをチェックし、TOTPなどのMFA要素で認証されたかを確認します。
    4.  `amr` クレームが空の場合（パスキーログイン等の一部のフローで発生する既知の挙動）は、**Cognito API (`AdminGetUser`) を呼び出してユーザーのMFA設定を直接確認するフォールバック**を実行します。
    5.  MFA未実施と判断された場合はDenyして管理APIへのアクセスをブロックし、フロントエンドはMFA設定ページ (`/mfa-setup`) へのリンクを表示します。

*   **管理者グループ構造**:
    *   **`Administrators`**: システム管理用のQRコード生成・管理ダッシュボード (`/admin`) にアクセスできるグループ。
    *   **`GlobalAdmins`**: Administratorsの権限に追加して，すべてのショップの管理画面を閲覧・編集可能なすべての権限を持つグループ。

*   **ALLOW_USER_AUTH フロー**: Cognito User Pool Client には `ALLOW_USER_AUTH` フローを有効化しており (`cfnUserPoolClient.explicitAuthFlows`)、将来的な認証方式の拡張に対応できる構成になっています。
