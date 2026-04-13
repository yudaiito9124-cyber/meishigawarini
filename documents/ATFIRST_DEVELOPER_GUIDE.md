# 🚀 開発者導入ポータル & 共通ガイド (Developer Onboarding Portal)

## 📌 はじめに (Introduction)
本ドキュメントは、プロジェクトに参加した開発者が「技術的な全体図」を把握し、スムーズに開発に参加するための**導入ポータル**です。

- **ポータル**: 必要なドキュメントやツールへの入り口。
- **共通基準**: プロジェクト全体で遵守すべき技術的な「憲法」。
- **操作マニュアル**: 日常のワークフローとメンテナンス手順。

---

## 1. 🚀 開発者オンボーディング (Day 1 Checklist)

新しい環境でコードを書く前に、以下の準備を完了させてください。

- [ ] **[環境構築手順書 (SETUP_ENVIRONMENT.md)](./SETUP_ENVIRONMENT.md)** に従い、Node.js / AWS CLI 等をインストールしたか？
- [ ] `aws login` (SSO ログイン) が正常に成功し、AWS リソースへアクセスできるか？
- [ ] `frontend/.env.local` を設定し、`npm run dev:stg` でローカルサーバーを起動できたか？
- [ ] **[AI 開発エチケット (ATFIRST_AI_ETIQUETTE.md)](./ATFIRST_AI_ETIQUETTE.md)** を読み、AI への指示作法を理解したか？
- [ ] `.agent/skills/development/SKILL.md` を AI アシスタントに読み込ませたか？

---

## 2. 🧠 システム全体像を理解する (System Overview)

実機のコードを読む前に、データがどのように流れるか、ビジネスがどう動くかの全体像を把握してください。

- 🔰 **[ATFIRST_OPERATION_FLOW.md](./ATFIRST_OPERATION_FLOW.md)**: ユーザー・ショップ・管理者が辿るビジネス工程の全体像。
- 🔰 **[ATFIRST_INFRA_AWS.md](./ATFIRST_INFRA_AWS.md)**: 使用している AWS サービスの構造と、環境分離ポリシー。
- 🔰 **[ATFIRST_AI_ETIQUETTE.md](./ATFIRST_AI_ETIQUETTE.md)**: AI との協調開発における絶対遵守ルール。

---

## 3. 🛠️ 実装・構築の要諦 (Foundational Specs)

日常の開発で最も頻繁に参照する「技術の核心」となるドキュメント群です。

### 3.1 構築・デプロイの手順 (Setup & Deployment)
- 🎒 **[SETUP_DEPLOYMENT.md](./SETUP_DEPLOYMENT.md)**: AWS へのデプロイ手順、ブランチ戦略、トラブルシューティング。

### 3.2 実践的な実装方法 (How-to-Develop)
- 📗 **[SPEC_HOW_TO_DEVELOP_BACKEND.md](./SPEC_HOW_TO_DEVELOP_BACKEND.md)**: Lambda / DynamoDB の実装レシピと BE 固有規約。
- 📗 **[SPEC_HOW_TO_DEVELOP_FRONTEND.md](./SPEC_HOW_TO_DEVELOP_FRONTEND.md)**: React / UI の実装レシピと FE 固有規約。
- 📗 **[SPEC_HOW_TO_DEVELOP_API_GW.md](./SPEC_HOW_TO_DEVELOP_API_GW.md)**: API ルーティング、認可、変換規則。

### 3.3 データ構造とインターフェース (DB & API)
- ☁️ **[SPEC_INFRA_DYNAMODB.md](./SPEC_INFRA_DYNAMODB.md)**: シングルテーブル設計の基本概念。
- 📊 **[REF_DB_SCHEMA.md](./REF_DB_SCHEMA.md)**: 厳密な PK/SK と属性の定義（DB の設計図）。
- 📚 **[REF_API_ENDPOINTS.md](./REF_API_ENDPOINTS.md)**: 全 API のパラメータ・レスポンス一覧（API リファレンス）。

---

## 4. 💎 共通開発基準 (Standards)

プロジェクト全体で遵守すべき基本的な技術規約と設計思想です。

### 4.1 命名規則の基本方針 (General Naming Policy)
- **ファイル・フォルダ**: 意味のわかる英単語を使用。
- **ケースの使い分け**: バックエンド編・フロントエンド編の各基準（camelCase / PascalCase / snake_case 等）を厳格に使い分けます。

### 4.2 コーディング規約 (Coding Philosophy)
- **型安全性の徹底**: `any` 禁止。API リクエスト/レスポンスには必ず `shared/api-types.ts` 等で定義された型を使用してください。
- **JSDoc の記述**: 関数や複雑なロジックには必ず JSDoc を記述し、引数、戻り値、処理の目的を明文化してください。

### 4.3 ドキュメンテーション戦略 (The Map vs. The Truth)
- **ドキュメントは地図 (Map)**: 全体構造、ファイル配置、利用技術の全体像を提示することに特化します。
- **ソースコードは真実 (Truth)**: 各関数の意図、スタイルの適用根拠など、網羅的な仕様はコメントとしてコード内に記述します。
- **目標**: 「ドキュメントで場所を特定し、コードを読むだけで詳細を理解できる」状態を維持します。

### 4.4 開発の作法 (Development Culture)
- **PR 運用**: 機能追加・バグ修正は必ず独立したブランチで行います。
- **修正の同期**: コードの変更が設計に影響する場合、`/documents/` 配下の関連ドキュメントを必ず同時に更新してください。

---

## 5. 🧰 ツール・索引 (Scripts Index)

「これをやりたい時はどのツールを使うか？」の逆引き一覧です。

| 用途 | スクリプトパス | 関連ドキュメント |
| :--- | :--- | :--- |
| **環境切替** | `frontend/scripts/switch-env.js` | `SETUP_DEPLOYMENT.md` |
| **SS 自動撮影** | `scripts/screenshot_auto_capture.py` | `SPEC_HELP_CMS.md` |
| **i18n チェック** | `frontend/messages/check.py` | `SPEC_HOW_TO_DEVELOP_FRONTEND.md` |
| **DB バックアップ** | `infra/scripts/backup-*.ps1` | [本ドキュメント](#8-運用とデータ保護-maintenance--operations) |
| **CDK デプロイ** | `infra/node_modules/.bin/cdk` | `SETUP_DEPLOYMENT.md` |

---

## 6. 📚 リファレンス・ハブ (Other References)

特定の機能を深掘りする際や、システム管理者が参照する索引リンク集です。

- 🗺️ **[INDEX.md](./INDEX.md)**: **全てのドキュメントのポータル。**
- 📂 **[REF_PROJECT_STRUCTURE.md](./REF_PROJECT_STRUCTURE.md)**: ディレクトリ構造とファイルの責務解説。
- 💡 **[SPEC_SECURITY.md](./SPEC_SECURITY.md)**: 認証・認可ポリシー、API Stealth 設計。
- 💡 **[SPEC_LOGGING.md](./SPEC_LOGGING.md)**: 構造化ログの出力仕様と CloudWatch 監視。
- 💬 **[SPEC_UNIFIED_CHAT_PLAYBOOK.md](./SPEC_UNIFIED_CHAT_PLAYBOOK.md)**: Unified Chat の設計思想、実装・監査フローの実践ガイド。
- ☁️ **[SPEC_INFRA_S3.md](./SPEC_INFRA_S3.md)**: バケット管理、Presigned URL、画像標準化。
- 📖 **[SPEC_UI_TRANSITIONS.md](./SPEC_UI_TRANSITIONS.md)**: 画面遷移フローと URL ルーティング詳細。
- 📚 **[REF_EMAIL_TEMPLATES.md](./REF_EMAIL_TEMPLATES.md)**: システム通知メールのテンプレート管理。

---

## 7. 🛡️ 運用とデータ保護 (Maintenance & Operations)

「システムの健全性維持」に関わる、頻度は低いが重要な操作手順です。

### 7.1 Cognito ユーザープール
Cognito は標準機能ではデータの自動エクスポートをサポートしていないため、カスタムスクリプトを使用します。
- **場所**: `infra/scripts/` 配下
- **バックアップ**: `.\backup-cognito-users.ps1 -UserPoolId "xxxx"`
- **リストア**: `.\restore-cognito-users.ps1 -UserPoolId "xxxx" -BackupFile "backup.json"`
  > [!WARNING]
  > リストア後のユーザーはパスワードの再設定が必要です。

### 7.2 インフラ保護方針
- **DynamoDB**: 本番 (`prod`) 環境では PITR (Point-in-Time Recovery) 7 日間，テーブル削除処理無効化を有効にしています。
- **S3**: 誤削除防止のためバージョニングを有効化しています。
- **コスト管理**: **[REF_SYSTEM_COSTS.md](./REF_SYSTEM_COSTS.md)** を参照してください。
