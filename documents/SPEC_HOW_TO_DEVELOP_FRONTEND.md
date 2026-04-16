# 開発導入・コーディングレシピ (Practical Development Recipes) - Frontend

## 役割 (Role)
本ドキュメントは、プロジェクトに参加した開発者が「実際にどのようにコードを書き、変数を扱い、ロジックを組むか」を、既存のコード例をベースに習得するためのガイドです。

> [!NOTE]
> 命名規則の基本理念やドキュメント戦略などのプロジェクト共通基準については、以下のガイドを事前に確認してください。
> 👉 **[開発者導入・操作ガイド (ATFIRST_DEVELOPER_GUIDE.md)](./ATFIRST_DEVELOPER_GUIDE.md#6-共通開発基準-common-development-standards)**

---

## 0. フロントエンド開発基準 (Frontend Standards)

実機の実装に入る前に、フロントエンド特有の規約を確認してください。

### 0.1 命名規則とディレクトリ構成
- **フロントエンドコンポーネント**: `PascalCase` (例: `HelpButton.tsx`)
- **フォルダ名**: `lowercase` または `kebab-case`
- **パスマッピング**:
    - **`@/*`**: `frontend/` ディレクトリのルートを指します。
    - **`@shared/*`**: `shared/` ディレクトリ（共通型定義など）を指します。

### 0.2 コーディング規約 (Frontend Standards)
- **Shadcn/UI の活用**: UI コンポーネントは原則として Shadcn/UI をベースとし、プロジェクトのデザインシステムに合わせます。参照：[スタイリングと UI コンポーネント](#27-スタイリングと-ui-コンポーネント-tailwind-css--shadcnui)
- **Tailwind CSS**: スタイリングには Tailwind CSS を使用し、アドホックな CSS ファイルの作成は避けてください。
- **Context API の利用**: ショップ詳細や商品リストなど、複数のコンポーネントで共有される状態は `ShopContext` で一元管理してください。参照：[フロントエンド・データ管理設計](#211-フロントエンドデータ管理設計-frontend-data-management-architecture)

### 0.3 ID 生成規則 (ID Generation Strategy)
プロジェクト内のデータID生成アルゴリズムです。フロントエンドでも新規データ（一時的なアイテム等）を作成する際に使用します。

- **実装箇所**: [`frontend/lib/id.ts`](../frontend/lib/id.ts) の `generateId()` 関数
- **フォーマット**: `{UTCタイムスタンプ}{ランダム英小文字3文字}-{UUID}`
- **設計意図**:
    - **視認性**: IDの先頭から作成日時を判別可能。
    - **ソート順**: 作成日時順に並ぶ性質（DynamoDBのSKで有用）。
    - **衝突回避**: タイムスタンプ + ランダム文字列 + UUID で一意性を保証。

### 0.4 UI/UX デザイン指針 (Design Principles)
- **カラーテーマ**: 基本的にモノトーンを基調とし、アクセントカラーには既存のテーマ（`primary`, `destructive` 等）を使用します。
- **レスポンシブ**: モバイルファーストで設計し、必要に応じて `md:`, `lg:` 等のプレフィックスでデスクトップ表示を調整します。

---

## 2. フロントエンドの論理と変数の扱い (Frontend: Logic & UI)

フロントエンド（React/Next.js）では、TypeScript（ロジック）で処理したデータを HTML（UI）へどのように繋ぎ、制御するかが重要です。

### 2.1 変数の埋め込みと加工 (Variable Handling)
TypeScript で定義した変数は、JSX 内で `{}` を使って直接参照できます。

```tsx
export function ProfileCard({ name, count }: { name: string, count: number }) {
  // TypeScript 層でデータを加工
  const displayName = name.toUpperCase();
  const isVIP = count > 100;

  return (
    <div className="p-4 border">
      {/* (1) 変数の直接埋め込み */}
      <h1>User: {displayName}</h1>

      {/* (2) 計算結果の反映 */}
      <p>Points: {count.toLocaleString()} pt</p>

      {/* (3) className への動的な変数適用 (cn ユーティリティ使用) */}
      <span className={cn(
          "text-xs px-2 py-1 rounded",
          isVIP ? "bg-gold text-black" : "bg-gray-100"
      )}>
        {isVIP ? "VIP Member" : "Standard member"}
      </span>
    </div>
  );
}
```

### 2.2 条件分岐の実装パターン (Conditional Branching)
JSX 内では `if` 文が使えないため、主に以下の 2 つのパターンで表示を切り替えます。

#### A. 三項演算子 (`? :`)： A または B を表示する場合
```tsx
{isLoading ? (
    <Spinner /> // ローディング中
) : (
    <DataList data={orders} /> // データ完了後
)}
```

#### B. 論理積演算子 (`&&`)： 特定の時だけ表示する場合
```tsx
{orders.length === 0 && (
    <p className="text-gray-500">注文データはありません。</p>
)}
```

### 2.3 リストの反復処理 (Looping with .map)
配列データから複数の HTML 要素を生成するには `.map()` を使用します。

```tsx
<ul>
  {/* key 属性には必ず一意な ID（qr_id など）を指定してください */}
  {filteredOrders.map((order) => (
    <li key={order.qr_id} className="border-b py-2">
      <span className="font-mono">{order.qr_id}</span>
      <span className="ml-4">{order.status}</span>
    </li>
  ))}
</ul>
```

### 2.4 ロジックの集約 (useMemo によるフィルタリング)
複雑な計算やフィルタリングは、再レンダリングのたびに走らないよう `useMemo` でキャッシュします。

```typescript
// 複数のフィルタ条件を統合して、表示用の配列を生成する例
const filteredOrders = useMemo(() => {
    return orders
        .filter(o => statusFilter === 'ALL' || o.status === statusFilter)
        .filter(o => !searchQuery || o.qr_id.includes(searchQuery))
        .sort((a, b) => new Date(b.ts_updated_at).getTime() - new Date(a.ts_updated_at).getTime());
}, [orders, statusFilter, searchQuery]); // 依存配列が変化したときだけ再計算
```

### 2.5 変数と定数の使い分け (Variable Definitions)

React（TypeScript）での変数定義は、**「レンダリング間で値を保持する必要があるか」**によって使い分けます。

| 種類 | キーワード | 用途 |
| :--- | :--- | :--- |
| **定数** | `const` | 再代入しない値。基本はこちらを使用します。 |
| **一時的な変数** | `let` | ループ内や、計算過程で書き換える値。 |
| **UIの状態** | `useState` | **値を書き換えた時に UI を再描画させたい場合**に使用します。 |

```typescript
// (1) 定数: コンポーネント外部に置くと再レンダリングの影響を受けない
const MAX_ITEMS = 100;

export function MyComponent() {
  // (2) 状態: UIに連動する値。setCount を呼ぶと UI が更新される
  const [count, setCount] = useState<number>(0);

  // (3) 一時変数: レンダリングのたびにリセットされる。
  // UIの更新には使えないが、計算の一時処理には最適
  let tempLabel = "Normal";
  if (count > 10) tempLabel = "High";

  return <div>{tempLabel}: {count}</div>;
}
```

### 2.6 副作用の処理 (useEffect)

`useEffect` は、レンダリング後に実行したい処理（API取得、タイマー、イベント購読など）を記述します。

```typescript
import { useEffect, useState } from 'react'; // [External]

export function DataFetcher({ id }: { id: string }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    // [1] 実行タイミング: id が変更された時に実行される
    console.log("Fetching data for:", id);

    const fetchData = async () => {
      const res = await fetch(`/api/data/${id}`);
      setData(await res.json());
    };
    fetchData();

    // [2] クリーンアップ: コンポーネントが消える時や、次の useEffect が走る前に実行
    return () => {
      console.log("Cleanup for id:", id);
    };
  }, [id]); // [3] 依存配列: ここに含めた変数が変化した時のみ再実行される

  return <div>{data?.name}</div>;
}
```

> [!CAUTION]
> **依存配列の無限ループに注意**
> `useEffect` の中で `setData` を行い、その `data` を依存配列に含めると、更新ループが発生しブラウザが固まります。

### 2.7 スタイリングと UI コンポーネント (Tailwind CSS & shadcn/ui)

本プロジェクトでは、CSS の記述を効率化しデザインの一貫性を保つため、**Tailwind CSS** と **shadcn/ui** を採用しています。

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com/docs)

#### A. Tailwind CSS (Utility-First CSS)
スタイルは個別の CSS ファイルに書くのではなく、HTML 要素の `className` にユーティリティクラス（`p-4`, `flex`, `bg-blue-500` など）を直接記述します。

```tsx
// サンプル: パディング、角丸、背景色、ホバー効果の適用
<div className="p-4 rounded-lg bg-mist-800 hover:bg-mist-700 transition-colors">
  <p className="text-white font-bold">Tailwind Style</p>
</div>
```

#### B. 動的なクラスの適用 (`cn` ユーティリティ)
条件によってクラスを切り替える場合、`lib/utils.ts` に定義された `cn` 関数を使用します。

> [!NOTE]
> **`cn` 関数の中身は何か？**
> 実質的には「**条件付きの文字列結合関数**」です（`clsx` と `tailwind-merge` のラッパー）。
> 単なる文字列結合と違う点は、`p-2` と `p-4` のように競合するクラスが指定された際に、**後に指定された方を優先して統合してくれる**点にあります。

```typescript
import { cn } from "@/lib/utils"; // [Project Specific]

function StatusBadge({ active }: { active: boolean }) {
  return (
    <div className={cn(
      "w-4 h-4 rounded-full", // 常に適用される共通クラス
      active ? "bg-green-500" : "bg-gray-400" // 条件によって変化するクラス
    )} />
  );
}
```

#### C. shadcn/ui (Reusable Components)
ボタン、ダイアログ、カードなどの基本的な UI 部品は、`frontend/components/ui/` 配下に「部品」として実装されています。
これらをインポートして使用することで、デザインガイドラインに沿った UI を素早く構築できます。

```tsx
import { Button } from "@/components/ui/button"; // [Project Specific]
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"; // [Project Specific]

export function DashboardCard() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Dashboard</CardTitle>
      </CardHeader>
      <CardContent>
        <p>ここにメインコンテンツを記述します。</p>
        {/* ボタンの variant (色・形状) や size を指定可能 */}
        <Button variant="outline" size="sm" className="mt-4">
          Click Me
        </Button>
      </CardContent>
    </Card>
  );
}
```

### 2.8 コンポーネントの対応表 (UI Element Mapping)

UI を構築する際、どの部品を使うべきかのクイックリファレンスです。

| UI要素 | shadcn/ui コンポーネント | インポートパスの例 |
| :--- | :--- | :--- |
| **ボタン** | `Button` | `@/components/ui/button` |
| **入力欄** | `Input` / `Textarea` | `@/components/ui/input` / `textarea` |
| **カード容器** | `Card`, `CardContent`等 | `@/components/ui/card` |
| **テーブル** | `Table`, `TableRow`等 | `@/components/ui/table` |
| **ダイアログ** | `Dialog`, `DialogContent`等 | `@/components/ui/dialog` |
| **バッジ** | `Badge` | `@/components/ui/badge` |
| **切り替え** | `Switch` | `@/components/ui/switch` |
| **ラベル** | `Label` | `@/components/ui/label` |
| **アイコン** | `Lucide-react` (外部) | `lucide-react` |

### 2.9 コンポーネントの配置とインポート (Folder Structure & Imports)

#### A. ディレクトリの役割
新規にコンポーネントを作成する場合、以下の基準で配置場所を決定します。

1.  **`frontend/components/ui/`**: プロジェクト全体で使い回す汎用部品（ボタン、入力欄など）。
2.  **`frontend/components/shop/`**: ショップ管理画面固有の部品。
3.  **`frontend/components/admin/`**: システム管理者画面固有の部品。
4.  **`frontend/app/[locale]/...`**: 各ページのメインロジック（Page コンポーネント）。

#### B. パスエイリアスの活用
インポート時は相対パス（`../../`）を避け、プロジェクト共通のエイリアスを使用してください。

- **`@/*`**: `frontend/` ディレクトリのルートを指します。
  ```tsx
  import { Button } from "@/components/ui/button";
  ```
- **`@shared/*`**: `shared/` ディレクトリ（フロント・バック共通型定義など）を指します。
  ```tsx
  import { ShopApiSchema } from "@shared/api-types";
  ```

### 2.10 よく使う修飾方法 (Common Styling Patterns)

本プロジェクトで頻出する Tailwind CSS のスタイル指定パターンです。[Tailwind 公式ドキュメント](https://tailwindcss.com/docs) も併せて参照してください。

#### A. カラー指定 (Colors)
色の指定は `プロパティ-色名-濃さ` で記述します。任意のコード (`[]`) も使用可能です。

| 種類 | クラス例 | 解説 |
| :--- | :--- | :--- |
| **標準カラー** | `text-red-500`, `bg-blue-600` | Tailwind 標準パレットを使用。 |
| **テーマカラー** | `text-primary`, `bg-destructive` | `globals.css` で定義されたテーマ色。 |
| **任意の色** | `bg-[#FF0000]`, `text-[rgb(0,0,0)]` | `[]` を使って 16進数や RGB を直接指定。 |
| **不透明度** | `bg-primary/10`, `text-black/50` | `/数値` で透明度を指定（0〜100、または 0〜1）。 |

#### B. レイアウト (Layout)
要素の配置や間隔を制御します。

| 目的 | クラス例 | 解説 |
| :--- | :--- | :--- |
| **Flexbox** | `flex items-center justify-between` | 横並び + 上下中央 + 両端揃え。 |
| **Grid (レスポンシブ)** | `grid grid-cols-1 md:grid-cols-3 gap-4` | スマホで1列、タブレット以上で3列のグリッド。 |
| **間隔 (Gap/Space)** | `gap-4`, `space-y-6` | 要素間の隙間。`space-y` は積み上げ要素に便利。 |
| **中央寄せ** | `mx-auto`, `flex justify-center` | ブロック要素または Flex コンテナでの中央配置。 |
| **固定・配置** | `absolute top-0 right-0`, `sticky top-0` | 絶対配置やスクロール追従。 |

#### C. サイズと形状 (Size & Shapes)
要素の大きさや角の丸みを指定します。

| 目的 | クラス例 | 解説 |
| :--- | :--- | :--- |
| **幅・高さ** | `w-full`, `h-screen`, `w-12 h-12` | 親要素いっぱい、画面いっぱい、または固定サイズ。 |
| **任意のサイズ** | `w-[350px]`, `min-h-[200px]` | 固定ピクセルなどを直接指定。 |
| **角丸** | `rounded-full`, `rounded-2xl` | 円形、または大きな角丸（モダンなデザイン）。 |
| **境界線** | `border-2`, `border-dashed` | 2pxの線、または破線。 |

#### D. タイポグラフィ (Typography)
文字の見た目を制御します。

| 目的 | クラス例 | 解説 |
| :--- | :--- | :--- |
| **サイズ** | `text-xs` (小) 〜 `text-7xl` (極大) | 文字の大きさ。 |
| **太さ** | `font-bold`, `font-medium`, `font-light` | 文字のウェイト。 |
| **アライメント** | `text-center`, `text-right` | 文字の左右中央寄せ。 |
| **装飾** | `underline`, `uppercase`, `tracking-wider` | 下線、大文字化、文字間隔の調整。 |

#### E. 状態とレスポンシブ (States & Responsive)
特定の条件下のみスタイルを適用します。

| 種類 | プレフィックス例 | 解説 |
| :--- | :--- | :--- |
| **ホバー** | `hover:bg-primary/90` | マウスオーバー時のスタイル。 |
| **デバイス幅** | `sm:`, `md:`, `lg:`, `xl:` | 画面幅に応じた切り替え。 |
| **ダークモード** | `dark:bg-mist-900` | ダークモード有効時のスタイル。 |

### 2.11 フロントエンド・データ管理設計 (Frontend Data Management Architecture)

ショップ管理画面（Shop Dashboard）における、効率的なデータ取得とコンポーネント間での状態共有の設計について説明します。

#### A. 背景と目的
かつての設計では、各コンポーネント（「商品管理」「受注一覧」など）が独自に API を呼び出していました。これにより以下の問題が発生していました：
- **冗長な API コール**: 同じショップ詳細や商品リストを複数のコンポーネントが個別に取得し、ネットワーク負荷が増大する。
- **データ不整合**: あるタブで商品を更新しても、他のタブにその変更が即座に反映されない。

これを解決するため、**React Context API** を用いた一元管理機構を導入しました。

#### B. アーキテクチャ概要
`frontend/context/ShopContext.tsx` に定義された `ShopProvider` が、ショップに関するすべての状態と取得ロジック（Fetchers）を保持します。

**構成要素**:
1.  **ShopProvider**: 
    - `page.tsx` のルートで呼び出され、配下の全コンポーネントにデータを提供します。
    - 各ショップ（`shopId`）ごとに独立したメモリ空間を持ちます。
2.  **useShopHook**:
    - コンポーネントからデータや更新関数にアクセスするためのカスタムフックです。
    - コンポーネントは `const { products, refreshProducts } = useShop();` のように必要なものだけを取り出します。

#### C. データの更新と同期（Granular Fetching）
この設計の最大の特徴は、**「更新は局所的だが、結果は全体で共有される」** 点にあります。

- **個別のリフレッシュ**:
  `refreshProducts()` を呼び出すと、商品リストだけが再取得されます。取得が完了すると Context 内の `products` 状態が更新され、それを参照している**すべてのコンポーネントが自動的に再レンダリング**されます。
- **統一されたインターフェース**:
  コンポーネントの Props は原則として `shopId` のみに統一されています。その他のミュータブルなデータは Context から取得するため、Props のバケツリレー（Prop Drilling）が発生しません。

#### D. 実装のガイドライン
新しいデータを共有したい場合は、以下の手順で Context を拡張します。

1.  **State の追加**: `ShopContext.tsx` 内に新しい `useState` を定義する。
2.  **Fetcher の追加**: そのデータを取得するための `useCallback` 関数を作成する。
3.  **Provider への登録**: `value` プロパティに State と Fetcher を含める。
4.  **コンポーネントでの利用**: 必要なコンポーネントで `useShop()` から取り出して使用する。

**注意事項**:
- **ブラウザタブ間の独立性**: Context はメモリ上の状態であるため、別タブで開いたページ間では同期されません。タブ間での同期が必要な場合は、`localStorage` や `BroadcastChannel` の検討が必要ですが、現状の管理画面では「1タブ内での一貫性」を優先しています。
- **初期ロード**: `ShopProvider` はマウント時に `refreshAll()` を実行し、主要なデータを一度に取得します。これにより、各タブに切り替えた際の「待ち時間」を最小限に抑えています。

#### E. 受取ページ (Receive) 特有のデータロード設計
受取ページ（`frontend/app/[locale]/receive/[qr_id]/page.tsx`）は、未ログインユーザーとログイン済ユーザーの両方がアクセスする特殊な公開ページであるため、以下の特別な非同期データロード設計が導入されています。

**5.1 ブラウザ制限（Safari等）の回避**:
- **問題**: Safari等の厳格なサードパーティCookie・トラッキング防止環境下において、未ログイン状態で Amplify の認証状態確認メソッド（`getCurrentUser()` や `fetchAuthSession()`）を呼び出すと、内部の iframe 処理がブロックされ、**UIの初期ロードが永遠にハングオーバー（フリーズ）** するというバグが存在します。
- **解決策**: `useEffect` 等で事前にフロントエンドのセッション有無（`isLoggedIn`）を軽量に判定し、メインのデータフェッチ関数である `loadMessages()` 内において、**「未ログインであることが分かっている場合は Cognito 関連の API コール（および認証付きの `userApi` コール）を意図的にスキップする」** ように Promise を条件付きで処理しています。

**5.2 チャット機能における名前の自動補完 (Auto-fill)**:
システムを利用する際の入力の手間を減らすため、`loadMessages()` の実行時に以下の順序で登録情報を取得し、チャットの「送信者名フィールド (`chatName`)」にプレフィル（自動反映）するロジックが組み込まれています。
1. 現在ログインしているユーザーの **「受取人としての登録済み氏名」** を優先的に取得。
2. 上記がない場合、本システム全体として保存されている **「プロフィール氏名 (`profileData.profile.name`)」** を取得。
3. いずれかが存在した場合、その値を `chatName` の初期状態として State にセット。

これにより、「名刺がわりに」を頻繁に利用するユーザーは、毎回名前を手入力する手間が省かれUXが向上します。

### 2.12 多言語対応 (i18n) の設計と運用

本システムのフロントエンドは、日本語（`ja`）と英語（`en`）を `next-intl` で運用しています。
この章では「仕組みの全体像」「実装手順」「運用時の落とし穴」をまとめます。

#### A. 全体アーキテクチャ（どこで言語が決まるか）

1. **ルーティング定義**: [`frontend/i18n/routing.ts`](../frontend/i18n/routing.ts)
  - サポートロケール: `['en', 'ja']`
  - デフォルト: `ja`
  - `localePrefix: 'never'` を指定し、ユーザー向け URL は `/ja/...` を出さない運用。

2. **リクエスト時のメッセージ解決**: [`frontend/i18n/request.ts`](../frontend/i18n/request.ts)
  - `requestLocale` を受け取り、無効値なら `defaultLocale` にフォールバック。
  - `../messages/${locale}.json` を動的 import してメッセージカタログを注入。

3. **ミドルウェアによるロケール判定**: [`frontend/middleware.ts`](../frontend/middleware.ts)
  - `next-intl/middleware` が `NEXT_LOCALE` Cookie と `Accept-Language` を使ってロケールを決定。
  - さらに本プロジェクト独自で旧ドメインから新ドメインへの 301 リダイレクトを先に実行。

4. **App Router 側の受け口**: `frontend/app/[locale]/...`
  - URL 上はプレフィックスを見せないが、アプリ内部は `[locale]` セグメントで分岐。
  - [`frontend/app/[locale]/layout.tsx`](../frontend/app/[locale]/layout.tsx) で `NextIntlClientProvider` を注入し、全画面で翻訳関数が利用可能。

#### B. 実装時の基本ルール（新規 UI を追加するとき）

1. **ハードコード禁止**
  - 画面表示文言（見出し、ボタン、トースト、バリデーション文言）は直接文字列を書かず、必ず翻訳キー経由で出す。

2. **キー命名規約**
  - 画面単位の namespace を作る（例: `AdminPage`, `ShopPage`, `ReceivePage`）。
  - 深い階層は「機能単位」で切る（例: `UserProfilePage.notifications.detail.updatedAt`）。
  - 既存キーの意味を変えない。意味が変わる場合は新キーを追加する。

3. **Client Component では `useTranslations`**
  - 例: `const t = useTranslations('ShopPage');`
  - 利用時: `t('title')`, `t('errors.submitFailed')`

4. **Server Component / Metadata では `getTranslations`**
  - 例: `const t = await getTranslations({ locale, namespace: 'Metadata' });`
  - `generateMetadata` 内も同様に namespace を明示する。

5. **翻訳ファイルは必ず同時更新**
  - [`frontend/messages/ja.json`](../frontend/messages/ja.json)
  - [`frontend/messages/en.json`](../frontend/messages/en.json)
  - 片方だけ更新した状態でマージしない。

#### C. 実装レシピ（最短手順）

新しい文言を 1 つ追加する標準手順です。

1. `ja.json` と `en.json` の同じ階層に同じキーを追加。
2. コンポーネントで `useTranslations('Namespace')` または `getTranslations(...)` を取得。
3. JSX 内の固定文字列を `t('...')` に置換。
4. `frontend/messages` で `python check.py` を実行し、キーの不足/過剰を確認。
5. 画面で日本語・英語の両方を目視確認（レイアウト崩れも含む）。

#### D. 変数埋め込み・複数形・条件分岐（ICU メッセージ）

`next-intl` は ICU 形式を扱えるため、文言内で安全に変数展開できます。

```json
{
  "Inbox": {
   "unread": "未読 {count} 件",
   "invite": "{name} さんから招待されています",
   "items": "{count, plural, =0 {項目なし} one {# 件} other {# 件}}"
  }
}
```

```tsx
const t = useTranslations('Inbox');
<p>{t('unread', { count: unreadCount })}</p>
<p>{t('invite', { name: profileName })}</p>
<p>{t('items', { count: items.length })}</p>
```

> [!TIP]
> 数値・日付の表現はロケール依存のため、表示形式を固定したい場合は `toLocaleString(locale)` 等で明示的に整形してから `t()` に渡してください。

#### E. エラー文言の多言語化（Backend エラー翻訳）

API 由来のエラーは、可能な限り UI 文言として翻訳して提示します。

- フック: [`frontend/hooks/useBackendError.ts`](../frontend/hooks/useBackendError.ts)
- 方針:
  - バックエンドの文字列（例: `USER_NOT_FOUND` や `Access Denied`）をキー形式に正規化。
  - `messages/[locale].json` の `Backend` セクションを参照。
  - キー未登録時は原文フォールバック。

これにより「未知エラーでも最低限情報を失わない」運用が可能です。

#### F. URL 設計とリンク生成の注意点

本プロジェクトは `localePrefix: 'never'` ですが、内部的には `[locale]` ルートを使います。

- 画面遷移は可能な限り [`frontend/i18n/routing.ts`](../frontend/i18n/routing.ts) から export された `Link` / `useRouter` を利用する。
- `window.location.pathname` の文字列解析でロケールを推測する実装は、必要最小限に留める。
- 共有 URL（SNS 共有やメール）では、受信側環境で言語判定が走ることを前提にする。

#### G. 新規ロケール追加時の手順（将来拡張）

例: `fr` を追加する場合。

1. [`frontend/i18n/routing.ts`](../frontend/i18n/routing.ts) の `locales` に `fr` を追加。
2. [`frontend/messages/fr.json`](../frontend/messages/fr.json) を新規作成（`ja.json` のキー構造を踏襲）。
3. ロケール依存表示（日付、通貨、曜日名など）で `locale` 引数を適切に渡す。
4. ヘルプコンテンツも必要に応じて `content/help/fr/...` を整備。
5. UI 崩れ（英語より文字長が長くなる言語）を優先チェック。

#### H. 品質保証チェックリスト（i18n 専用）

1. [ ] 追加したキーは `ja.json` / `en.json` 両方に存在するか。
2. [ ] `python check.py` の結果で不足キーが 0 件か。
3. [ ] `t('...')` の namespace は実データ構造と一致しているか。
4. [ ] 画面の日本語/英語で改行崩れ・ボタン幅崩れがないか。
5. [ ] エラー時文言（API失敗時）も翻訳されるか。

#### I. バックエンド（メールテンプレート）との責務分離

- フロント UI 文言: `frontend/messages/*.json`
- バックエンド通知（例: メール）: [`infra/lambda/templates/email.ts`](../infra/lambda/templates/email.ts)

責務を混在させると、翻訳更新漏れの原因になります。

#### J. メール通知の多言語選択ロジック（UI 外メッセージ）

メール通知はフロント画面の `next-intl` とは別系統で、多言語テンプレートを選択します。

1. **テンプレート配置**
  - 本文テンプレート: `infra/lambda/templates/locales/{ja|en}/`
  - 件名テンプレート: `infra/lambda/templates/locales/{ja|en}.json`

2. **言語選択の優先情報**
  - 送信先メールアドレスごとの `email_preferences`
  - API 側で渡される `locale` パラメータ
  - プロフィールに保持された言語設定

3. **運用上の注意**
  - UI の翻訳キー更新と、メールテンプレート更新は別作業として管理する。
  - 新しい通知種別を追加する際は、`ja` / `en` の本文・件名を同時に追加する。
  - 「画面は翻訳済みだがメールは未翻訳」という乖離を防ぐため、PR で両系統を同時レビューする。

4. **参照先**
  - メールの通知種別や送信条件は [`REF_EMAIL_TEMPLATES.md`](./REF_EMAIL_TEMPLATES.md) を参照。

### 2.13 外部アカウント連携 (External Identity Providers)

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

### 2.14 マニュアル用画像の自動撮影 (Screenshot Automation)

製品マニュアルやヘルプページで使用するスクリーンショットの撮影を、AI Agent（Playwright + browser-use）を用いて自動化しています。これにより、UIの変更に追従したマニュアルの更新コストを最小化しています。
- **詳細設計**: [SPEC_HELP_CMS.md](./SPEC_HELP_CMS.md) を参照してください。
- **実行方法**: [ATFIRST_DEVELOPER_GUIDE.md](./ATFIRST_DEVELOPER_GUIDE.md) のツール索引を参照してください。

---

## 3. 重要ドキュメントへのポータル索引

実装に迷ったら、以下の「真実」へ立ち戻ってください。

- **[共通開発基準 (ATFIRST_DEVELOPER_GUIDE.md)](./ATFIRST_DEVELOPER_GUIDE.md#6-共通開発基準-common-development-standards)**
    - 命名規則の基本理念、ドキュメント戦略、PRルールなど。
- **[データの真実：共有 API 型定義 (shared/api-types.ts)](../shared/api-types.ts)**
    - フロントとバックエンドが交わす「契約」としてのデータ型。
- **[インフラの真実：DynamoDB 設計 (SPEC_INFRA_DYNAMODB.md)](./SPEC_INFRA_DYNAMODB.md)**
    - PK/SK の意味合い、GSI の引き方など。
- **[作法：AI Etiquette (ATFIRST_AI_ETIQUETTE.md)](./ATFIRST_AI_ETIQUETTE.md)**
    - 高密度なドキュメンテーションと、 lossless な編集の哲学。

---

## 4. チェックリスト：デプロイ前に確認すること

実装が完了したら、以下の「実機の真実」を確認してください。

1.  [ ] **`npx tsc --noEmit`** を実行し、フロントエンドに型エラーがないか？
2.  [ ] **バックエンドの各関数冒頭**に、適切な File Header コメントはあるか？
3.  [ ] **DB操作箇所**に、PK/SK の役割説明コメントがあるか？
4.  [ ] **`any` 型**を放置していないか？
