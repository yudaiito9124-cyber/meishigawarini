# 開発者導入・操作ガイド (Developer Introduction & Operations Guide)

## 役割 (Role)
本ドキュメントは、プロジェクトに参加した開発者が「技術的な全体図」を把握し、日常の開発・運用操作を迷わずに行えるようにするためのガイドです。「導入ポータル」および「操作マニュアル」としての役割を持ちます。

## 責務 (Responsibility)
- システムの物理・論理構造のマップ提供。
- 標準的な開発・デプロイワークフローの提示。
- データのバックアップ・リストア等の運用手順の明文化。
- プロジェクト内で利用可能なツールの逆引き索引の提供。

---

## 1. API処理の流れとディレクトリ構成 (Project Map)

実機のコードを読む前に、データがどのように流れるかの全体像を把握してください。リクエストは常に以下の順序で処理されます。

0.  **Ground Truth / Base Layer** ([`shared/api-types.ts`](../../shared/api-types.ts))
    - **全ての基準となる型定義**（唯一の真実）です。このファイルの定義を元に、各レイヤーの整合性が保たれます。


1.  **Frontend API Client** (`frontend/lib/api/*.ts`)
    - `adminApi`, `shopApi`, `receiveApi` 等のプロキシ経由でメソッドを呼び出します。
2.  **Infra / CDK** (`infra/lib/constructs/*-api.ts`)
    - API Gatewayのパス定義と、Lambda関数へのルーティング、権限付与を行います。
3.  **Lambda Function** (`infra/lambda/*.ts`)
    - 各エンドポイントに対応した個別のビジネスロジックを実行します。

より詳細なAPIの仕様については **[API Gateway仕様 (SPEC_INFRA_API_GW.md)](./SPEC_INFRA_API_GW.md)** を参照してください。


---

## 2. 日常の技術ワークフロー (Standard Workflow)

開発環境の構築完了後、日々の作業は以下の流れで行います。詳細な手順は **[デプロイ手順書 (SETUP_DEPLOYMENT.md)](./SETUP_DEPLOYMENT.md)** に記載されています。

1.  **認証**: `aws login` (SSO ログイン) を行い、AWS リソースへのアクセス権を確保します。
2.  **起動**: `cd frontend` -> `npm run dev:stg` で検証用バックエンドに接続したローカルサーバーを起動します。
3.  **実装**: **[開発標準規約 (SPEC_DEV_STANDARDS.md)](./SPEC_DEV_STANDARDS.md)** に従い、コードを編集します。
4.  **検証**: `npx tsc` や `cdk diff` で静的チェックを行い、`cdk deploy -c stage=stg` で検証環境に反映します。
5.  **提出**: 作業ブランチを push し、`stg` ブランチへ Pull Request を作成します。

---

## 3. データのバックアップとリストア (Ops)

### 3.1 Cognito ユーザープール
Cognito は標準機能ではデータの自動エクスポートをサポートしていないため、カスタムスクリプトを使用します。

- **実行スクリプト**: `infra/scripts/` 配下の PowerShell スクリプトを使用します。
- **バックアップ**: `.\backup-cognito-users.ps1 -UserPoolId "ap-northeast-1_xxxxxxxxx"`
- **リストア**: `.\restore-cognito-users.ps1 -UserPoolId "復元先ID" -BackupFile "backup.json"`
  > [!WARNING]
  > リストア後のユーザーはパスワードの再設定が必要です。

### 3.2 インフラ保護方針
- **DynamoDB**: 本番環境 (`prod`) では PITR (Point-in-Time Recovery) ７日間を有効にしています。
- **S3**: 誤削除防止のためバージョニングを有効化しています。

---

## 4. 開発・運用ユーティリティ索引 (Scripts Index)

「これをやりたい時はどのツールを使うか？」の逆引き一覧です。

| 用途 | スクリプトパス | 関連ドキュメント |
| :--- | :--- | :--- |
| **環境切替** | `frontend/scripts/switch-env.js` | `SETUP_DEPLOYMENT.md` |
| **SS 自動撮影** | `scripts/screenshot_auto_capture.py` | `SPEC_HELP_CMS.md` |
| **i18n チェック** | `frontend/messages/check.py` | `SPEC_DEV_STANDARDS.md` |
| **DB バックアップ** | `infra/scripts/backup-*.ps1` | 本ドキュメント |
| **CDK デプロイ** | `infra/node_modules/.bin/cdk` | `SETUP_DEPLOYMENT.md` |

---

## 5. テクニカル・オンボーディング (Checklist)

新しい環境で開発を始める前に、以下の準備ができているか確認してください。

- [ ] **[環境構築手順書 (SETUP_ENVIRONMENT.md)](./SETUP_ENVIRONMENT.md)** に従い、Node.js / AWS CLI 等がインストールされているか？
- [ ] `aws login` が正常に成功し、S3 や DynamoDB のリストを確認できるか？
- [ ] `frontend/.env.local` が適切に設定され、`npm run dev:stg` が起動するか？
- [ ] **[AI 開発エチケット (ATFIRST_AI_ETIQUETTE.md)](./ATFIRST_AI_ETIQUETTE.md)** を読み、AI への指示方法を理解したか？
- [ ] `SKILL.md` を AI アシスタントに読み込ませたか？

緊急時の連絡先や体制については `TODO.md` またはプロジェクトの連絡チャンネル（Slack等）を確認してください。
