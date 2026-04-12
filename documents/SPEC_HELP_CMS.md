# ヘルプコンテンツ管理システム 仕様・運用ポータル

このドキュメントは、Markdown ファイルからヘルプページを生成するシステムの「地図」であり、リファレンスです。実装の細部については、後述の構成要素が示すソースコード内のコメントを参照してください。

---

## 1. 原理と設計思想 (Principles)

### 動的ルーティングと 2 系統のヘルプ系統
システムの URL パスと `frontend/content/` 配下のディレクトリ構造は 1:1 で対応しています。本プロジェクトには「一般用」と「管理者用」の 2 つの系統があります。

| 系統 | URL プレフィックス | コンテンツ配置パス | 特徴 |
| :--- | :--- | :--- | :--- |
| **一般・ショップ用** | `/help/[...slug]` | `frontend/content/help/[locale]/` | ライトテーマ、カテゴリ別アイコン |
| **システム管理者用** | `/admin/help/[...slug]` | `frontend/content/admin-help/[locale]/` | ダークテーマ、管理者アイコン固定 |

### プロセッシング・パイプライン
Markdown のパースには `remark` と `rehype` エコシステムを採用しています。

1. **メタデータ抽出**: `gray-matter` を使用して、Markdown 先頭の `---` (フロントマター) からタイトルなどの属性を抽出します。
2. **Markdown パース**: `remark-parse` で Markdown を AST (抽象構文木) に変換します。
3. **HTML変換**: `remark-rehype` で HTML 用のデータ構造に変換します。
4. **Reactコンポーネント化**: `rehype-react` を使い、標準の HTML タグ（`h1`, `p`, `img`など）を、プロジェクト独自の React コンポーネント（Shadcn UI や `next/image`）に置き換えてレンダリングします。詳細は [MarkdownRenderer.tsx](file:///Users/yudai/git/meishigawarini/frontend/components/help/MarkdownRenderer.tsx) を参照してください。

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
1. `frontend/content/help/[locale]/` または `admin-help/[locale]/` 配下に、作成したいURLと同じ名前のフォルダを作成します。
2. そのフォルダの中に `index.md` を作成します。
3. `index.md` に内容を記述します（UTF-8エンコード推奨）。先頭に `title` などのメタデータを記述してください。

※ すでに `app/help/` 内に `page.tsx` が存在する場合は、その静的なルーティングが Markdown ベースの動的生成よりも優先されます。

### 画像の配置
画像は `public/images/manual/` 等に配置し、Markdown 内では絶対パスで指定します。
- 例: `![キャプション](/images/manual/example.webp)`

---

## 4. コンポーネント・リファレンス (Reference)

[MarkdownRenderer.tsx](file:///Users/yudai/git/meishigawarini/frontend/components/help/MarkdownRenderer.tsx) で定義されている特殊な記法と、そのレンダリング結果の一覧です。

| 記法・クラス | レンダリング結果 | 記述例 (Markdown) |
| :--- | :--- | :--- |
| **H3 ナンバリング** | 丸数字アイコン付き見出し | `### 1 手順の開始` |
| **Notice ブロック** | 薄い背景の通知枠（URLの提示などに使用） | `<section class="notice">内容</section>` |
| **Benefit ブロック** | グラデーションの強調枠（メリット紹介用） | `<section class="benefit">メリット</section>` |
| **Heroセクション** | ブランドカラーの巨大枠（最重要事項） | `<section class="hero">重要事項</section>` |
| **Helpカード** | アイコン付き誘導パネル（他ページへの導線） | `<a href="..." class="card-help" data-icon="store">タイトル</a>` |
| **Mermaid** | 動的フローチャート（手順の視覚化） | ` ```mermaid ... ``` ` |

### 記述サンプル (Examples)

#### 手順書の作成例
```markdown
### 1 ログインする
[ログイン画面](/login)へアクセスし、情報を入力します。

<section class="notice">
パスワードを忘れた場合は再発行が必要です。
</section>

### 2 設定を確認する
...
```

#### リッチな誘導リンク (カード形式)
```markdown
<div class="grid-help">
  <a href="/help/shop/activate" class="card-help" data-icon="qrcode">
    ## アクティベーション
    カードを有効化する手順を確認します。
  </a>
</div>
```

---

## 5. 技術メンテナンス
詳細なスタイル定義やコンポーネントの挙動を調整したい場合は、以下のファイルを直接参照・編集してください。ソースコードには各要素の意図が詳細にコメントされています。

- **レンダリングエンジン**: [MarkdownRenderer.tsx](file:///Users/yudai/git/meishigawarini/frontend/components/help/MarkdownRenderer.tsx)
  - 新しい HTML タグのスタイルを定義したり、既存のコンポーネントを差し替えたりできます。
- **ページ全体の共通レイアウト**: `frontend/app/[locale]/help/[...slug]/page.tsx`
  - 余白、背景色、戻るボタンのスタイルなどを変更できます。
- **画像コンポーネント**: [HelpImage.tsx](file:///Users/yudai/git/meishigawarini/frontend/components/help/HelpImage.tsx)
- **スタイル定義**: `tailwind.config.js` および各コンポーネントの `className`

---

## 6. スクリーンショットの自動撮影 (Automation)
「名刺代わりに」のヘルプページで使用される画像は、AI Agent を利用したオートメーションツールによって自動的に撮影・更新することが可能です。これにより、UI の変更や多言語対応に伴うマニュアルの鮮度維持を効率的に行えます。

### 6.1 仕組みの概要
AI Agent (`browser-use` ＋ `Playwright` ＋ `Gemini`) が、指示書となる Markdown ファイル（`REF_SCREENSHOT_PLAN.md`）を読み取り、ブラウザ操作を行ってスクリーンショットを取得します。

- **安定した画面取得**: チャンクスクロールによる Lazy Load 対策と、動的なビューポートリサイズにより、ページ全体の精細な WebP 書き出しをサポートしています。
- **セッションの永続化**: 独自のブラウザプロファイル (`.browser_profile`) を使用し、ログイン状態をタスク間で共有します。

### 6.2 技術的なセットアップ
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
    - `PLAN_FILENAME`: 指示書のファイル名 (デフォルト: `REF_SCREENSHOT_PLAN.md`)
    - `BASE_URL`: スクリーンショット対象のベースURL (デフォルト: `http://localhost:3000`)

### 6.3 運用ワークフロー
実行は「ログインフェーズ」と「撮影フェーズ」の2段階で自動的に進行します。

1.  **指示書（真実の源泉）の更新**:
    `documents/REF_SCREENSHOT_PLAN.md` を編集し、撮影したい画像のパス、対象 URL、操作手順（自然言語で記述可能）をテーブルに追加します。
    - **ルール**: 必ず `<!-- STEPS_START -->` と `<!-- STEPS_END -->` の間に記述してください。
    - **変数**: `[qr_id_active]` などのプレースホルダーを使用可能です。

2.  **スクリプトの実行**:
    ```bash
    cd scripts
    source .venv/bin/activate
    python screenshot_auto_capture.py
    ```
    実行するとブラウザが自動的に立ち上がり、以下の順序で処理されます：
    - **Phase 1 (Login)**: 指定されたベースURLのログイン画面へ移動し、認証状態を確保。
    - **Phase 2 (Capture)**: 指示書に従い、各ボタンのクリックやナビゲーションを行って目的の状態に到達し、フルページ・キャプチャを実行。

3.  **結果の確認**:
    生成された画像は自動的に以下のディレクトリに上書き保存されます。
    - `frontend/public/images/manual/auto_screenshots/`

### 6.4 指示書の記載ルール (REF_SCREENSHOT_PLAN.md)
指示書は Markdown のテーブル形式で記述します。詳細は [REF_SCREENSHOT_PLAN.md](./REF_SCREENSHOT_PLAN.md) 自体のコメントを参照してください。

| Path | Navigation & Capture Instruction (LLM Prompt) | Target Filename |
| :--- | :--- | :--- |
| `/user/sendgift` | コピーしたIDを入力して、確認画面が表示されている状態を撮影 | `user_sendgift++STEP=confirm.webp` |

- **Path**: 対象URL（相対パス）。
- **LLM Prompt**: AI Agent への命令。
- **Target Filename**: 保存されるファイル名。`++` 等を用いた命名規則に従ってください。
