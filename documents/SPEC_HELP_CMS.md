# ヘルプコンテンツ管理システム 詳細仕様・運用ガイド

このドキュメントでは、Markdown ファイルからヘルプページを動的に生成するシステムの仕組み、設計思想、および運用方法について解説します。

---

## 1. 原理と設計思想 (Principles)

### 動的ルーティングとファイルベース管理
Next.js の **Catch-all Segment** (`[...slug]`) を利用し、URLパスとファイルシステムのパスを 1:1 で対応させています。

- **URL**: `/ja/help/shop/operation`
- **対象ファイル**: `frontend/content/help/ja/shop/operation/index.md`

この設計により、新しいディレクトリと `index.md` を作成するだけで、プログラムのコードを変更することなく新しいページを即座に追加できます。

### プロセッシング・パイプライン
Markdown のパースには `remark` と `rehype` エコシステムを採用しています。

1. **メタデータ抽出**: `gray-matter` を使用して、Markdown 先頭の `---` (フロントマター) からタイトルなどの属性を抽出します。
2. **Markdown パース**: `remark-parse` で Markdown を AST (抽象構文木) に変換します。
3. **HTML変換**: `remark-rehype` で HTML 用のデータ構造に変換します。
4. **Reactコンポーネント化**: `rehype-react` を使い、標準の HTML タグ（`h1`, `p`, `img`など）を、プロジェクト独自の React コンポーネント（Shadcn UI や `next/image`）に置き換えてレンダリングします。

---

## 2. ページとの連携状態 (Integration)

### メタデータ連携
`app/[locale]/help/[...slug]/page.tsx` 内の `generateMetadata` 関数が Markdown ファイルを事前に読み込み、フロントマターの `title` をブラウザのタブ名に反映させます。

### パンくずリスト・戻るボタンの論理
URLのスラッグ（配列）を解析し、末尾の要素を除去することで親ディレクトリのパスを自動計算します。
- スラッグ `['shop', 'operation']` -> 親パス `/help/shop`
これにより、階層が深くなっても自動的に「前のページに戻る」リンクが正しく機能します。

---

## 3. 操作方法 (Operation)

### ページの追加手順
1. `frontend/content/help/[locale]/` 配下に、作成したいURLと同じ名前のフォルダを作成します。
2. そのフォルダの中に `index.md` を作成します。
3. `index.md` に内容を記述します（UTF-8エンコード推奨）。
※ すでに app/help/内に page.tsx が存在する場合はそちらが優先されます

### 画像の追加
1. 画像ファイルを `frontend/public/images/manual/` などの `public` ディレクトリ配下に保存します。
2. Markdown 内で絶対パスを使用して指定します。
   例: `![キャプション](/images/manual/example.webp)`

### 特別な記法の利用
標準の Markdown に加え、以下のスタイルが適用可能です。

| 記法 | レンダリング結果 |
|:---|:---|
| `### 1 タイトル` | 丸数字アイコン付きの見出し |
| `![Alt](Path)` | 角丸・シャドウ・背景色付きの画像コンテナ |
| `<section class="notice">...` | 背景の通知ブロック（URLの提示などに使用） |

---

## 4. 技術メンテナンス
レンダリングの仕組みを調整したい場合は、以下のファイルを編集してください。

- **タグの対応付け指定**: `frontend/components/help/MarkdownRenderer.tsx`
  - 新しい HTML タグのスタイルを定義したり、既存のコンポーネントを差し替えたりできます。
- **ページ全体の共通レイアウト**: `frontend/app/[locale]/help/[...slug]/page.tsx`
  - 余白、背景色、戻るボタンのスタイルなどを変更できます。

---

## 5. スクリーンショットの自動撮影 (Automation)

「名刺代わりに」のヘルプページで使用される画像は、AI Agent を利用したオートメーションツールによって自動的に撮影・更新することが可能です。これにより、UI の変更や多言語対応に伴うマニュアルの鮮度維持を効率的に行えます。

### 5.1 仕組みの概要
AI Agent (`browser-use` ＋ `Playwright` ＋ `Gemini 2.0 Flash`) が、指示書となる Markdown ファイル（`REF_SCREENSHOT_INSTRUCTIONS.md`）を読み取り、ブラウザ操作を行ってスクリーンショットを取得します。

### 5.2 技術的なセットアップ
スクリプトの実行には Python 環境が必要です。

1.  **仮想環境の作成とライブラリのインストール**:
    ```bash
    cd scripts
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    playwright install chromium
    ```

2.  **環境変数の設定**:
    `scripts/.env` ファイルを作成（または編集）し、以下の項目を設定します。
    - `GOOGLE_API_KEY`: Google AI Studio 等から取得した Gemini API キー
    - `LOGIN_EMAIL`: テストユーザーのメールアドレス（通常は不要、Google認証を利用）
    - `LOGIN_PASSWORD`: テストユーザーのパスワード（通常は不要、Google認証を利用）

### 5.3 運用ワークフロー

1.  **指示書の更新**:
    `documents/REF_SCREENSHOT_INSTRUCTIONS.md` を編集し、撮影したい画像のパス、対象 URL、操作手順（自然言語で記述可能）をテーブルに追加します。

2.  **スクリプトの実行**:
    ```bash
    cd scripts
    source .venv/bin/activate
    python screenshot_auto_capture.py
    ```
    実行するとブラウザが自動的に立ち上がり、指示書に従って各画面を撮影していきます。Google 認証などで手動介入が必要な場合は、ブラウザ画面上で操作を完了させてください。

3.  **結果の確認**:
    生成された画像は自動的に以下のディレクトリに上書き保存されます。
    - `public/images/manuals/auto_screenshots/`

### 5.4 指示書の記載ルール (REF_SCREENSHOT_INSTRUCTIONS.md)
指示書は Markdown のテーブル形式で記述します。

| 画像パス | 対象URL | 撮影状態 / 操作手順 |
| :--- | :--- | :--- |
| `example.webp` | `/path/to/page` | 「保存ボタン」をクリックして、ダイアログが表示されている状態を撮影 |

- **画像パス**: `auto_screenshots/` 配下に保存されるファイル名。
- **対象URL**: ベースURL（localhost:3000等）を除いた相対パス。
- **操作手順**: AI Agent への命令です。「〇〇をクリックして」「〇〇を待って」など具体的に記載すると精度が向上します。
