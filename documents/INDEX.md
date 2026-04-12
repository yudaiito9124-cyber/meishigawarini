# [名刺がわりに] ドキュメント・インデックス (Documentation Index)

本プロジェクトのすべての仕様・構成・手順を集約するメイン・ポータルです。
目的（構築・仕様確認・参照）に合わせてドキュメントを選択してください。

---

## 🚩 0. まず最初に (AT FIRST)
プロジェクトに参加したら最初に確認すべき、全体像や基本ルールのガイド。

- 🔰 **[ATFIRST_OPERATION_FLOW.md](./ATFIRST_OPERATION_FLOW.md)**  
  ユーザー、ショップ、管理者が辿るビジネスライフサイクル全体像。
- 🔰 **[ATFIRST_INFRA_AWS.md](./ATFIRST_INFRA_AWS.md)**  
  プロジェクトで使用している主要AWSサービスの全体図と役割解説。
- 🔰 **[ATFIRST_AI_ETIQUETTE.md](./ATFIRST_AI_ETIQUETTE.md)**  
  AI アシスタントが遵守すべき「鉄則」と、共同開発の作法。
- 🔰 **[ATFIRST_DEVELOPER_GUIDE.md](./ATFIRST_DEVELOPER_GUIDE.md)**  
  開発者に向けた技術的な全体像、日常のワークフロー、ツール索引、および運用保守手順を含む開発者導入ガイド。

---

## 🛠️ 1. 構築・手順 (SETUP)
環境の構築、デプロイ、アカウント設定など、システムを動かすための手順書。

- 🎒 **[SETUP_ENVIRONMENT.md](./SETUP_ENVIRONMENT.md)**  
  完全初心者向けPC環境構築（AWS CLI, Node.js）と AWS アカウント設定・初期セットアップ。
- 🎒 **[SETUP_DEPLOYMENT.md](./SETUP_DEPLOYMENT.md)**  
  フロント・バックエンドそれぞれの開発・デプロイ手順とトラブルシューティング。

---

## 💡 2. 仕様・設計 (SPEC)
システムの論理構造、アーキテクチャ、実装上の考え方。

- 📖 **[SPEC_UI_TRANSITIONS.md](./SPEC_UI_TRANSITIONS.md)**  
  画面（URLルーティング）ごとの役割と、ボタン等の操作フロー詳細。
- 📖 **[SPEC_DEV_STANDARDS.md](./SPEC_DEV_STANDARDS.md)**  
  命名規則、コーディング規約、型安全、および設計・品質の基準（技術的な「法律」）。
- 📖 **[SPEC_HELP_CMS.md](./SPEC_HELP_CMS.md)**  
  フロントエンドのヘルプページ・マニュアルコンテンツの更新・管理方法。
- ☁️ **[SPEC_INFRA_DYNAMODB.md](./SPEC_INFRA_DYNAMODB.md)**  
  DynamoDBシングルテーブル設計の基本概念とベストプラクティス。
- 📊 **[UML_DATA_STRUCTURE.md](./UML_DATA_STRUCTURE.md)**  
  ロール別（User/Shop/QR/Admin）に整理された論理データ構造のUMLクラス図。
- ☁️ **[SPEC_INFRA_API_GW.md](./SPEC_INFRA_API_GW.md)**  
  API Gateway ルーティング、CORS、Lambda Authorizer の仕組み。
- ☁️ **[SPEC_INFRA_S3.md](./SPEC_INFRA_S3.md)**  
  S3 ストレージ管理、Presigned URL、画像標準化プロセスの設計。
- 💡 **[SPEC_FE_DATA_STATE.md](./SPEC_FE_DATA_STATE.md)**  
  ShopContext を使用したデータ管理戦略とフロントエンド設計指針。
- 💡 **[SPEC_SECURITY.md](./SPEC_SECURITY.md)**  
  セキュリティ方針、API Stealth 設計、認証認可の仕様。
- 💡 **[SPEC_LOGGING.md](./SPEC_LOGGING.md)**  
  CloudWatch Logs による監視と、ログ出力・保存の設計ルール。

---

## 📚 3. リファレンス (REF)
表形式のデータ、リスト、ソースコードの要約情報。

- 📚 **[REF_API_ENDPOINTS.md](./REF_API_ENDPOINTS.md)**  
  Admin / Shop / Receive 全APIエンドポイントのパラメータ・レスポンス一覧。
- 📚 **[REF_DB_SCHEMA.md](./REF_DB_SCHEMA.md)**  
  DynamoDB `MeishiGawariniTableV2` の厳密なPK/SK/属性スキーマ定義。
- 📚 **[REF_EMAIL_TEMPLATES.md](./REF_EMAIL_TEMPLATES.md)**  
  システム自動送信メールのタイミング、テンプレート、使用変数一覧。
- 📚 **[REF_SYSTEM_COSTS.md](./REF_SYSTEM_COSTS.md)**  
  サーバーレス環境の維持費、ドメイン費用、および予算監視設定。
- 📚 **[REF_PROJECT_STRUCTURE.md](./REF_PROJECT_STRUCTURE.md)**  
  プロジェクト全体のフォルダ構成と、各ディレクトリの役割解説。

---

## 🤖 AI共同開発用スキル
- 🤖 **[SKILL.md](../.agent/skills/development/SKILL.md)**  
  AI エージェントに対する技術的な「命令（しつけ）」の定義。
- 🤖 **[REF_SCREENSHOT_PLAN.md](./REF_SCREENSHOT_PLAN.md)**  
  AI エージェントがスクリーンショットを撮影する際の指示書。

---

## 📊 4. その他資料 (OTHERS)
プロジェクトの管理情報や、特定の用途で使用するツール・資料。

- 📝 **[TODO.md](../TODO.md)**  
  現在の開発ステータスと、今後の実装予定タスク。
- 📝 **[updatelog.md](../updatelog.md)**  
  プロジェクトの主要な変更履歴。
- 📝 **[minutes.md](../minutes.md)**  
  これまでの開発会議の議事録。
- 🪄 **[ランディングページ生成用プロンプト](../紹介ページデザイン例/ランディングページ生成用プロンプト.md)**  
  埋め込みHTMLウィジェット（ランディングページ）を AI で生成するための指示書。
