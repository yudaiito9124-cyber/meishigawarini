# 名刺代わりに 

ようこそ、名刺がわりに プロジェクトへ！
本リポジトリは、QRコードを用いて簡単にギフトや商品を贈る・受け取ることができるサービスのソースコードです。

**このドキュメントはほとんどGeminiが生成したものです。内容の確認はしていますが、言い回し等については修正していませんのでご容赦ください。**

![alt text](/documents/data/image.webp)

---

## 📖 ドキュメント・ポータル

プロジェクトの詳細な仕様、環境構築手順、開発ルールなどはすべて以下のインデックスに集約されています。
**開発を始める前に、必ずこちらを確認してください。**

### 🚩 メインインデックス
- **[ドキュメント・インデックス (INDEX.md)](./documents/INDEX.md)**  
  すべてのドキュメントへの起点となるポータルです。

### 🚀 クイックアクセス（重要ドキュメント）
新しくプロジェクトに参加した方が全体像を把握するために、まず以下の2つに目を通すことをおすすめします。

- 🔰 **[At FIRST Operation Flow](./documents/ATFIRST_OPERATION_FLOW.md)**  
  ユーザー、ショップ、管理者が辿るビジネスライフサイクルの全体像。
- 🎨 **[UI Transition Spec](./documents/SPEC_UI_TRANSITIONS.md)**  
  画面遷移図と各ページのデザイン・操作仕様。

---

## 🛠️ クイックセットアップ

環境構築が必要な場合は、インデックス内の「構築・手順」セクション、または直接以下のガイドを確認してください。

- **[SETUP_ENVIRONMENT.md](./documents/SETUP_ENVIRONMENT.md)**  
  （AWS CLI, Node.js のインストールから初期設定まで）

---

### 主な技術スタック
*   **フロントエンド**: Next.js (App Router, React 19), Tailwind CSS, Shadcn/ui
    *   ユーザーが実際に操作する画面の構築に使用しています。
*   **バックエンド / インフラ**: AWS CDK v2 (TypeScript)
    *   AWS上に構築されるサーバーやデータベースの設計図をコードで書いています。
*   **オートメーション**: Playwright, browser-use (Python)
    *   マニュアル用スクリーンショットの自動撮影などに使用しています。

### 初期開発時の環境
* **OS** : windows 11
* **IDE** : Google Antigravity (Visual Studio Code)
* **言語** : TypeScript (npm)
* **AWS region** : ap-northeast-1 (東京)

---

不明点があれば気軽にチームメンバーにお声がけください！