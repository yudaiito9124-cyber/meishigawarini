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
