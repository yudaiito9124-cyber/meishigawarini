# 開発・設計ガイド (Development & Design Guide)

## 役割 (Role)
本ドキュメントは、プロジェクト開発における全体的な標準、コーディング規約、および技術的な手順を提供するための主要なガイドラインです。新しくプロジェクトに参加する開発者（人間およびAI）が、既存の設計思想を損なうことなく、一貫した品質で開発を行えるようにすることを目的としています。

## 責務 (Responsibility)
- 処理フローの全体像の提供。
- 命名規則、コーディング規約の定義。
- API型安全性の確保手順の明文化。
- 共通のUI/UX原則の提示。

## コンテキスト (Context)
このプロジェクトは、Next.js (Frontend) と AWS CDK / Lambda (Backend) を使用した、ギフト体験をデジタル化するサービスです。

---

## 1. 技術導入と全体地図 (Technical Onboarding)

システム全体の処理フロー、ディレクトリ構成、および日常の開発ワークフローについては、まず以下の導入ガイドを参照してください。

👉 **[開発者導入・操作ガイド (ATFIRST_DEVELOPER_GUIDE.md)](./ATFIRST_DEVELOPER_GUIDE.md)**

---

## 2. 命名規則とパスのマッピング

- **フロントエンドコンポーネント**: `PascalCase` (例: `HelpButton.tsx`)
- **フォルダ名**: `lowercase` または `kebab-case`
- **API・Lambda 関連の命名**:
    - Lambda 関数名やファイル名、フロントエンドの API メソッド名は `snake_case` で統一します。
    - **重要**: アンダースコア（`_`）が URL パスのスラッシュ（`/`）に対応します。
    - 詳細なマッピング規則については **[API Gateway 実装ガイド (SPEC_INFRA_API_GW.md)](./SPEC_INFRA_API_GW.md#4-フラットなアクションベースのルーティング設計)** を参照してください。
- **変数・属性の命名 (snake_case の統一基準)**:
    - 原則として、APIペイロードおよびDynamoDB内部属性（Database）の両方で `snake_case` を使用します。
    - **特記事項 (移行互換性)**:
        - 過去の経緯により、一部の属性（`zipCode`, `preferredDate`, `preferredTime`）が `camelCase` で保存されている可能性があります。
        - 読み取りロジック（`shop_orders.ts`, `admin_qr_list.ts` 等）では、これら両方の命名形式を許容する「二重読み込み（Dual-Read）」を実装し、互換性を維持してください。

---

## 3. コーディング規約 (Coding Standards)

### 3.1 TypeScript & 型定義
- **型安全性の徹底**: `any` の使用は原則禁止です。APIのリクエスト/レスポンスには必ず型を定義し、共有フォルダ（`shared/`）または各 API 定義ファイルで管理してください。
- **JSDoc の記述**: 関数や複雑なロジックには必ず JSDoc を記述し、引数、戻り値、例外、および処理の目的を明文化してください。

### 3.2 フロントエンド (Frontend)
- **Shadcn/UI の活用**: UI コンポーネントは原則として Shadcn/UI をベースとし、プロジェクトのデザインシステムに合わせます。
- **Tailwind CSS**: スタイリングには Tailwind CSS を使用し、アドホックな CSS ファイルの作成は避けてください。
- **Context API の利用**: ショップ詳細や商品リストなど、複数のコンポーネントで共有される状態は `ShopContext` で一元管理してください。

### 3.3 バックエンド (Lambda)
- **DB 操作の明確化**: `ddb.send` 等の操作箇所には、目的、テーブル、キー(PK/SK)、GSI、取得・更新カラムをコメントとして具体的に記述してください。
- **バリデーション**: 入力値のバリデーションを Lambda の冒頭で行い、不正なリクエストには適切なエラーレスポンスを返してください。

### 3.4 ID 生成規則 (ID Generation Strategy)
プロジェクト内のほぼ全てのデータ（ショップ、商品、QRコード、カード発発注等）のIDは、以下の独自アルゴリズムを使用して生成します。

- **実装箇所**: バックエンドとフロントエンドの両方に、全く同じアルゴリズムで個別に実装されています。
    - Backend: [`infra/lambda/utils/id.ts`](../infra/lambda/utils/id.ts) の `generateId()` 関数
    - Frontend: [`frontend/lib/id.ts`](../frontend/lib/id.ts) の `generateId()` 関数
- **フォーマット**: `{UTCタイムスタンプ}{ランダム英小文字3文字}-{UUID}`
    - 例: `20240408103000abc-123e4567-e89b-12d3-a456-426614174000`
- **設計意図**:
    - **視認性**: IDの先頭を見るだけで、そのデータがいつ作成されたかを即座に判別可能にします。
    - **ソート順**: ID順で並び替えた際に、作成日時順に並ぶ性質を持ちます（DynamoDBのSK等で有用）。
    - **衝突回避**: タイムスタンプとランダム文字列に加え、UUIDを結合することで、高頻度な生成時でも一意性を完全に保証します。

### 3.5 多言語対応 (i18n) の設計と運用
システム全体で日本語（ja）と英語（en）の多言語対応を行っています。

- **採用ライブラリ**: フロントエンドでは `next-intl` を使用しています。
- **URL設計とルーティング**:
    - **設定**: [`frontend/i18n/routing.ts`](../frontend/i18n/routing.ts) にて `localePrefix: 'never'` を指定。
    - **挙動**: URLパスに `/ja/` などの言語プレフィックスを含めず、`/shop` などのクリーンなURLを維持します。
    - **設定スクリプト**: [`frontend/next.config.ts`](../frontend/next.config.ts) で `withNextIntl` プラグインを統合しています。
- **言語の自動判定ロジック**:
    - [`frontend/middleware.ts`](../frontend/middleware.ts) がリクエストをインターセプトし、以下の優先順位で言語を判定して内部的に `app/[locale]` セグメントへマッピングします。
        1. **Cookie**: `NEXT_LOCALE` の値。
        2. **ヘッダー**: ブラウザの `Accept-Language`。
        3. **デフォルト**: 判定不能な場合は `ja` を使用。
- **メッセージ管理と整合性チェック**:
    - **ファイル**: `frontend/messages/ja.json`, `en.json`
    - **チェックスクリプト**: [`frontend/messages/check.py`](../frontend/messages/check.py)
        - `python check.py` を実行することで、日・英のメッセージファイル間でキーの過不足がないかを自動検証できます。
- **バックエンドの対応**:
    - メール通知などは [`infra/lambda/templates/email.ts`](../infra/lambda/templates/email.ts) ににて、DynamoDB上のユーザー設定やリクエストに応じた言語切り替えを行っています。詳細は [`REF_EMAIL_TEMPLATES.md`](./REF_EMAIL_TEMPLATES.md) を参照してください。

### 3.6 外部アカウント連携 (External Identity Providers)
当プロジェクトでは、Amazon Cognito Hosted UI を利用した外部 IdP（ソーシャルログイン）連携をサポートしています。

- **利用プロバイダー**: Google, Amazon
- **実装方式**:
    - **Infrastructure**: [`infra/lib/infra-stack.ts`](../infra/lib/infra-stack.ts) にて `supportedIdentityProviders` を設定。Hosted UI のドメイン（`meishigawarini${suffix}.auth.[region].amazoncognito.com`）を有効化しています。
    - **Frontend**: `aws-amplify` SDK の `signInWithRedirect()` メソッドを使用して Hosted UI へリダイレクトさせます。
- **リダイレクト URL の動的決定**:
    - 開発(localhost)、ステージング、本番の各環境でリバースプロキシやドメインが異なるため、[`frontend/app/components/ConfigureAmplify.tsx`](../frontend/app/components/ConfigureAmplify.tsx) 内で `window.location.origin` を元に `redirectSignIn` と `redirectSignOut` を動的に生成し、Amplify に設定しています。
- **外部 IdP 利用時の事前設定（重要）**:
    - CDK (`infra-stack.ts`) ではプロバイダーの「有効化」と「リダイレクト先の設定」のみを行っています。
    - **Google/Amazon 等の Client ID / Client Secret の発行および Cognito User Pool への実際のプロバイダー登録は、各環境の AWS マネジメントコンソールから手動で行う必要があります。**
    - 登録時には、プロバイダー側の属性（`email` 等）を Cognito の標準属性（`email`）にマッピングする設定を必ず含めてください。
- **デプロイ・CI/CD 時の注意**:
    - Amplify Hosting (`amplify.yml`) を利用する場合、`NEXT_PUBLIC_COGNITO_DOMAIN` などの環境変数は Amplify コンソールの環境変数設定に登録されている必要があります。ビルド時に `printenv` によって `.env` ファイルへ書き出され、アプリケーションに注入されます。
- **管理者アカウントに関する重要な制約**:
    - **管理権限（`Administrators`, `GlobalAdmins`）を持つユーザーは、必ずメールアドレスとパスワードによるネイティブアカウントで運用する必要があります。**
    - これは、管理APIアクセス時に Lambda Authorizer が MFA（多要素認証）の完了をチェックするためです。現在の AWS 仕様上、外部 IdP 経由のユーザーには Cognito ネイティブの TOTP MFA を設定できないため、外部アカウントでは管理機能をフルに利用できません。詳細は **[セキュリティガイド (SPEC_SECURITY.md)](./SPEC_SECURITY.md#8-管理者専用のmfa強制-lambda-authorizer)** を参照してください。

### 3.7 マニュアル用画像の自動撮影 (Screenshot Automation)
製品マニュアルやヘルプページで使用するスクリーンショットの撮影を、AI Agent（Playwright + browser-use）を用いて自動化しています。これにより、UIの変更に追従したマニュアルの更新コストを最小化しています。
- **詳細設計**: `SPEC_HELP_CMS.md` を参照してください。
- **実行方法**: `ATFIRST_DEVELOPER_GUIDE.md` のツール索引を参照してください。

### 3.8 テスト戦略 (Testing Strategy)

本プロジェクトでは、コードの品質とデプロイ後の安定性を担保するため、以下のテスト方針を採用しています。

- **単体テスト (Unit Testing)**:
  - 未実装
- **静的解析 (Static Analysis)**:
  - **TypeScript**: `npx tsc --noEmit` をデプロイ前に必ず実行し、型エラーがないことを確認します。
  - **ESLint**: 未使用

### 3.9 UI 実装パターン (Premium Design Patterns)

- 未定義

---

## 4. UI/UX デザイン指針 (Design Principles)

基本的にモノトーンとしますが未定義です

---

## 5. 複数人開発におけるルール (Multi-person Rules)

- **PR (Pull Request)**: 機能追加やバグ修正は、必ず独立したブランチで行い、PR を経てマージしてください。
- **ドキュメントの更新**: コードの変更が設計や手順に影響を与える場合、必ず `/documents/` 配下の関連ドキュメントを同時に更新してください。
- **AI エチケット**: AI を活用した開発を行う際は、`AI_ETIQUETTE.md` に定められたガイドラインを遵守してください。

### 5.1 ドキュメンテーション戦略 (The Map vs. The Truth)
本プロジェクトでは、「ドキュメントは地図（Map）であり、ソースコードは真実（Truth）である」という原則を徹底します。

- **ドキュメントの役割**: システム全体の構造、ファイル配置、ルーティング、利用技術の全体像、および「使い方の例」や「記法のリファレンス表」を提示することに特化します。
- **ソースコードの役割**: 各関数の意図、パラメータの目的、スタイルの適用根拠など、網羅的な「真実（詳細仕様）」をコメントとして記述します。
- **目標**: 開発者が「ドキュメントで場所と概要を把握し、コードを読むだけで詳細仕様まで完全に理解できる」状態を目指します。

詳細は **[AI 開発エチケット (ATFIRST_AI_ETIQUETTE.md)](./ATFIRST_AI_ETIQUETTE.md#11-ドキュメンテーション戦略-the-map-vs-the-truth)** を参照してください。
