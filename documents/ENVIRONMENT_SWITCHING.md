# 環境切り替え・管理ガイド (最新版)

本ドキュメントでは、ソースコードの管理（Git）と、各環境への反映方法（デプロイ）を切り分けて解説します。

---

## 1. ソースコードのバージョン管理 (Git)

フロントエンドとバックエンドのコードは同一のリポジトリで管理されています。以下のブランチ構成で運用します。

| ブランチ名 | 役割 | 統合のタイミング |
| :--- | :--- | :--- |
| **`master`** | **本番環境用** | `stg` での検証が完了した後、リリース時にマージ |
| **`stg`** | **検証環境用** | 開発が完了した作業ブランチをマージ |
| **`dev`** または **作業ブランチ** | **開発作業用** | 日々の機能開発・修正時に使用 |

---

## 2. 各環境の対応とデプロイ方法

「どのブランチのコード」を「どこに反映（デプロイ）」するかの一覧です。

| 環境 | 対象ブランチ | 実行場所 | 実行方法 (デプロイ) |
| :--- | :--- | :--- | :--- |
| **本番 (Prod)** | `master` | AWS | **フロント**: `git push` で自動 (Amplify)<br>**バック**: `cdk deploy` (手動) |
| **検証 (Stg)** | `stg` | AWS | **フロント**: `git push` で自動 (Amplify)<br>**バック**: `cdk deploy -c stage=stg` (手動) |
| **開発 (Local)** | 作業ブランチ | **自分のPC** | `npm run dev:stg` または `dev:prod` |

> [!IMPORTANT]
> **バックエンドは常にAWS上で動作します。**
> 自分のPC（Local）で開発する場合も、接続先はAWS上のStagingまたはProductionになります。

---

## 3. 具体的な切り替え手順

### A. フロントエンドをローカルで動かす (Local接続先の切り替え)
`frontend` フォルダでコマンドを実行します。

- **Stagingに繋ぐ (推奨)**: `npm run dev:stg`
  - `.env.staging` が `.env.local` にコピーされ、検証用AWSに接続します。
- **Productionに繋ぐ**: `npm run dev:prod`
  - `.env.production` が `.env.local` にコピーされ、本番用AWSに接続します。

### B. バックエンド (AWS) を更新する
`infra` フォルダでコマンドを実行します。※デプロイにはAWS認証 (`aws login`) が必要です。

- **検証環境の更新**: `npx cdk deploy -c stage=stg`
- **本番環境の更新**: `npx cdk deploy`

---

## 4. 標準的な開発・リリースフロー

開発の開始から本番公開までを、時系列で詳細に示します。

### ステップ①：検証（Staging）環境での作業開始
1. `git checkout stg`
   - 検証用ベースブランチへの切り替え
2. `git checkout -b feature/xxx`
   - 自分専用の作業ブランチの作成
3. `cd infra` -> `npx cdk deploy -c stage=stg`
   - バックエンド（AWS Stg）への最新状態の反映

### ステップ②：プログラムの編集と検証
「バックエンドを先に修正してから、それを使うフロントエンドを書く」のが基本的な流れです。

1. **バックエンド（API・DB定義など）の編集**
   - `infra/lambda/` 配下などのプログラム修正やCDK定義の変更
2. `cd infra` -> `npm run test` (任意)
   - ユニットテストによるロジックの単体検証
3. `npx cdk deploy -c stage=stg`
   - 修正したバックエンドを検証用AWSへ反映
4. **フロントエンド（画面）の編集**
   - [VS Code] 等での修正。`npm run dev:stg` を起動したまま作業
5. **ブラウザで [http://localhost:3000](http://localhost:3000) を確認**
   - 変更したバックエンド(AWS)と接続されたローカル画面での動作確認

### ステップ③：検証サイト（Amplify）への反映
1. `git add .` -> `git commit -m "xxx"` -> `git push origin feature/xxx`
   - 編集したコード（フロント・バック両方）の保存とGitHubへの反映
2. **GitHub上で `stg` ブランチへの Pull Request を作成・マージ**
   - 検証用共通コードへの統合
3. **ブラウザで [検証用URL(https://stg.dh74sua11za2r.amplifyapp.com/)](https://stg.dh74sua11za2r.amplifyapp.com/) を確認**
   - Amplifyによる自動ビルド完了後の、実際の検証サイトでの最終動作確認

### ステップ④：本番環境（Production）へのリリース
1. `cd ../infra` -> `npx cdk deploy`
   - 本番用バックエンド（AWS Prod）への反映
2. `git checkout master` -> `git merge stg` -> `git push origin master`
   - 検証済みコードの本番用ブランチへの統合
3. **ブラウザで [本番URL(https://meishigawarini.com)](https://meishigawarini.com) を確認**
   - Amplifyによる自動ビルド完了後の、実際の本番サイトでの公開確認

---

## 関連ファイル
- [frontend/package.json](file:///c:/git/meishigawarini/frontend/package.json): ローカル実行スクリプト定義
- [infra/bin/infra.ts](file:///c:/git/meishigawarini/infra/bin/infra.ts): CDK環境分岐ロジック
- [amplify.yml](file:///c:/git/meishigawarini/amplify.yml): フロントエンド自動ビルド設定
