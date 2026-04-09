# 開発・デプロイ手順書（フロントエンド＆バックエンド）

## 役割 (Role)
本ドキュメントは、プロジェクトの技術的な開発フロー、デプロイメントパイプライン、およびシステム全体のデプロイプロセスを定義します。開発者が機能をデプロイし、システム運用を維持するための公式な手順書です。

## 責務 (Responsibility)
- フロントエンドおよびバックエンドのデプロイメントフローの明文化。
- 各環境（Local / Staging / Production）の使い分けの定義。
- トラブルシューティング（ビルドエラー等）への対応手順の提示。

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

この開発環境では、バックエンドはAWS上のみで動かす前提です(フロントエンドはローカルでも動かすことができます)。AWS上には**検証用**と**本番用**の実行環境がそれぞれ用意されています。

|  | AWS上で実行 | localで実行 | 備考 |
| :--- | :--- | :--- | :--- |
| バックエンド | 検証用(stg), 本番用(prod) | - | CDKを使ってデプロイ(各種AWSサービスが連携) |
| フロントエンド | 検証用(stg), 本番用(prod) | local | AWS上ではAmplifyがgitの更新を検知して自動デプロイします |

### 「どのブランチのコード」を「どこの環境に」「どのようにデプロイ」するか
| 環境 | 対象ブランチ |  フロントエンドデプロイ方法(AWS Amplify) | フロントエンドのみローカルで実行する方法  | バックエンドデプロイ方法(AWS CDK) |
| :--- | :--- | :--- | :--- | :--- |
| **本番 (Prod)** | `master` | masterブランチの更新(push)で自動デプロイ | `npm run dev:prod` (本番用バックエンド) | `npx cdk deploy -c stage=prod` (手動デプロイ) |
| **検証 (Stg)** | `stg` | stgブランチの更新(push)で自動デプロイ | `npm run dev:stg` (検証用バックエンド) | `npx cdk deploy -c stage=stg` (手動デプロイ) |

> [!IMPORTANT]
> **バックエンドは常にAWS上で動作します。**
> 自分のPC（Local）で開発する場合も、接続先はAWS上のStagingまたはProductionになります。

> [!WARNING]
> 開発用バックエンドはSTG環境１つのみしか用意できていないため、現状バックエンドを同時に編集できるのは一人までになります．

---

## 3. 標準的な開発・リリースフロー

開発の開始から本番公開までを、時系列で詳細に示します。

### ステップ①：検証（Staging）環境での作業開始
1.  `git checkout stg`
    - 検証用ベースブランチへの切り替え
2.  `git checkout -b feature/xxx`
    - 自分専用の作業ブランチの作成

### ステップ②：プログラムの編集と検証（バックエンドのSTG環境に対するデプロイ）
「バックエンドを先に修正してから、それを使うフロントエンドを書く」のが基本的な流れです。

1.  **バックエンド（API・DB定義など）の編集**
    - `infra/lambda/` 配下などのプログラム修正やCDK定義の変更
2.  **変更内容の検証**
    - `cd infra`
    - **AWSにログインする**: `aws login` （1日1回程度でOKです）
    - `npx tsc --noEmit` （静的型チェック：エラーがないか確認）
    - `npx cdk synth` （定義の整合性チェック）
    - `npx cdk diff -c stage=stg`
      > [!IMPORTANT]
      > 「どこが追加され、どこが削除されるか」を確認してください。意図しない変更（データベースの削除など）が含まれていないか必ずチェックします。
3.  **検証環境への反映**
    - `npx cdk deploy -c stage=stg`
    - 途中で `Do you wish to deploy these changes (y/n)?` と聞かれたら、内容を確認して **`y`** を入力します。
    > [!WARNING]
    > デプロイの結果、APIのエンドポイントやCognitoのIDが変更された場合は、`frontend/.env.staging` の値も更新してください。
4.  **フロントエンド（画面）の編集**
    - [VS Code] 等での修正。`npm run dev:stg` を起動したまま作業
    - *※このコマンドを実行すると、`.env.staging` の内容が `.env.local` に自動的にコピーされます。*
5.  **ブラウザで [http://localhost:3000](http://localhost:3000) を確認**
    - 変更したバックエンド(AWS)と接続されたローカル画面での動作確認

### ステップ③：検証サイト（Amplify）へのフロントエンドの反映
1.  **GitHubへの反映**
    - `cd frontend` -> `npx tsc --noEmit` （画面側の型チェック）
    - `git add .` -> `git commit -m "xxx"` -> `git push origin feature/xxx`
2.  **GitHub上で `stg` ブランチへの Pull Request を作成・マージ**
    - 検証用共通コードへの統合
3.  **ビルド状況の確認**
    - **AWS Amplify の管理画面**を開き、ビルドが正常に完了したか確認します。
4.  **ブラウザで [検証用URL(https://stg.dh74sua11za2r.amplifyapp.com/)](https://stg.dh74sua11za2r.amplifyapp.com/) を確認**
    - 実際の検証サイトでの最終動作確認

### ステップ④：本番環境（Production）へのリリース
1.  **バックエンドのデプロイ**
    - `cd infra`
    - `aws login` （ログイン済みなら不要）
    - `npx tsc --noEmit` （静的型チェック：エラーがないか確認）
    - `npx cdk diff -c stage=prod` （本番環境との差分を最終確認）
    - `npx cdk deploy -c stage=prod`
    > [!WARNING]
    > APIのURLやCognitoのIDが新しくなった場合は、`frontend/.env.production` を更新してください。
2.  **フロントエンドの反映**
    - `git checkout master` -> `git merge stg` -> `git push origin master`
3.  **ビルド状況の確認**
    - **AWS Amplify の管理画面**を開き、ビルド状況を確認します。
4.  **ブラウザで [本番URL(https://meishigawarini.com)](https://meishigawarini.com) を確認**
    - 実際の本番サイトでの公開確認

---

## 4.　トラブルシューティング（よくあるエラーと解決法）

### 「`npm install` や `npm ci` でエラーが出る」「Amplifyのビルドが失敗する」場合

複数の開発者がパッケージを追加・更新した際に、設定ファイル（`package.json`）と、実際のバージョンを記録したファイル（`package-lock.json`）の間に不整合（ズレ）が生じることがあります。
このズレが原因でエラーが起きている場合は、以下の手順で**「関連ファイルを一度すべて削除し、ゼロから再インストール（クリーンインストール）」**することで解決します。

1.  エラーが出ているフォルダ（`frontend` または `infra`）に移動します。
2.  以下のコマンドを実行し、一時ファイル群を強制的に削除します。
    ```bash
    # Windows の場合 (PowerShell)
    Remove-Item -Recurse -Force node_modules, package-lock.json
    
    # Mac / Linux の場合
    rm -rf node_modules package-lock.json
    ```
3.  依存関係をゼロから再解決してインストールします（これにより正しい `package-lock.json` が再生成されます）。
    ```bash
    npm install
    ```
4.  （確認用）クリーンインストールが正しく終了するか確認します。
    ```bash
    npm ci
    ```
これで不整合が解消され、エラーなくサーバー起動やビルド（デプロイ）ができるようになります。