# S3 ストレージ運用・管理ガイド

本プロジェクトにおける S3 バケット (`ProductImageBucket`) のフォルダ構造、ファイル命名規則、および管理ロジックについて解説します。

---

## 1. フォルダ構造の設計

ストレージ内は用途に応じて明確に物理的なパスが分かれています。

| パス (キーの接頭辞) | 用途 | 備考 |
| --- | --- | --- |
| `products/` | 商品画像 | ショップオーナーがアップロードした商品画像。 |
| `admin/card-designs/temp/` | **一時アップロード** | カードデザイン編集時にアップロードされた未保存の画像。 |
| `admin/card-designs/{designId}/` | **デザイン本番** | 保存が確定したカードデザインの背景およびサムネイル。 |

---

## 2. カードデザインのライフサイクルと管理ロジック

カードデザイン機能では、ストレージのクリーンアップと整合性を保つため、以下の仕組みを導入しています。

### ① 一時保存 (`temp/`) と本番化
1. 編集画面で画像をアップロードすると、まず `admin/card-designs/temp/` にランダムなID (`generateId()`) を含んだファイル名で保存されます。
2. ユーザーが「保存」ボタンを押した際、Lambda 関数 (`admin-card-designs.ts`) が起動し、一時フォルダ内の画像を各デザイン専用のフォルダ (`admin/card-designs/{designId}/`) へ移動（Copy & Delete）します。

### ② ファイル名の標準化
保存確定時に、システムは自動的にファイル名を規定のものに書き換えます。これにより、フロントエンドやPDF生成ロジックでのパス指定が簡略化されます。

*   **表面背景**: `bgimgf.[ext]`
*   **裏面背景**: `bgimgb.[ext]`
*   **表面サムネイル**: `thumbf.webp` (クライアント側で WebP 変換)
*   **裏面サムネイル**: `thumbb.webp` (クライアント側で WebP 変換)

### ③ 再帰的削除 (Recursive Deletion)
デザインを削除する際、DBレコードの削除と同時に、S3 上の当該 `designId` フォルダ全体を削除するユーティリティ (`deleteFolderFromS3`) が実行されます。これにより、未使用の画像がストレージに残ることを防ぎます。

---

## 3. セキュリティとアクセスポリシー

### 署名付き URL (Pre-signed URL)
バケットそのものは非公開 (`PublicAccessBlock`) 設定となっています。
*   **PUT 操作**: 5分間有効な署名付き URL を発行し、フロントエンドから直接 S3 へアップロードします。
*   **GET 操作**: 1時間有効な署名付き URL を発行します。署名付き URL の末尾にあるクエリパラメータ (`X-Amz-Signature` 等) は Lambda 側でDB保存前に自動的に除去され、常に「ベースとなるクリーンなURL」が管理されます。

### CORS 設定
ローカル開発 (`localhost:3000`, `3001`) および本番ドメインからのクロスオリジンアクセスが許可されています。PDF生成などで Canvas を利用する際は、画像タグに `crossOrigin="anonymous"` を付与することで CORS ポリシーを遵守しています。

---

## 4. 関連プログラム

*   **ユーティリティ**: `infra/lambda/utils/s3.ts` (移動、署名、削除の共通処理)
*   **管理者 API**: `infra/lambda/admin-card-designs.ts` (ライフサイクル管理)
*   **商品 API**: `infra/lambda/shop-mgmt.ts`

---

## 5. 実装レベルでの操作方法

プロジェクト内の Lambda 関数から S3 を操作する際は、`infra/lambda/utils/s3.ts` にまとめられた共通ユーティリティを使用します。これらは内部的に AWS SDK v3 (`@aws-sdk/client-s3`) を利用しています。

### 基本的な操作フロー
1.  **署名付き URL によるアップロード (PUT)**:
    フロントエンドは API (`.../uploadurl`) を介して、期限付きの署名付き URL を取得します。
    *   `getSignedUrl` (`@aws-sdk/s3-request-presigner`) を使用。
    *   セキュリティのため、ACL は `private` で発行されます。

2.  **DB 保存時のクリーンアップ**:
    署名付き URL に含まれるクエリパラメータ（認証情報）を DB に保存せず、ベースとなる URL のみを保存します。
    *   `stripSignature(url)` を使用。
    *   DB には `https://{bucket}.s3.{region}.amazonaws.com/{key}` の形式で保存されます。

3.  **表示時の動的署名 (GET)**:
    フロントエンドへデータを返却する際、読み取り専用の署名付き URL を動的に生成して付与します。
    *   `signUrlIfS3(url, bucket)` を使用。
    *   HTML コンテンツ内の複数の URL を一括して署名する場合は `signUrlsInHtml(html, bucket)` を利用します。

4.  **アセットのローカライズ (Move)**:
    一時フォルダ (`temp/`) にアップロードされた画像を、特定の ID に基づいた恒久的なパスへ移動し、ファイル名を標準化（例: `bgimgf.png`）します。
    *   `localizeS3Image(url, bucket, designId, type)` を使用。
    *   内部的には `CopyObjectCommand` 実行後に `DeleteObjectCommand` を実行します。

---

## 6. ストレージパスの詳細定義

プロジェクト内で実際に保存されるデータの物理パス（S3 キー）の定義一覧です。

| 分類 | S3 キー (パス) の構造 | 説明 |
| :--- | :--- | :--- |
| **商品画像** | `shop/{shopId}/products/{productId}/{id}.{ext}` | 各ショップの商品ごとの画像。 |
| **ショップコンテンツ** | `shop/{shopId}/shopcontent/{filename}` | ショップのロゴや紹介用画像など。 |
| **ユーザープロフィール** | `user/{userId}/profile/{timestamp}-{filename}` | プロフィール画像および自己紹介HTML内の埋め込み画像。 |
| **チャット送信ファイル** | `qrcode/{qrId}/chat/{id}.{ext}` | QRコードに紐づくチャットで送信された画像やファイル。 |
| **カードデザイン (一時)** | `temp/card-designs/{designId}/{tempId}_{filename}` | 編集中の未確定データ。 |
| **カードデザイン (恒久)** | `admin/card-designs/{designId}/{targetFilename}` | 保存済みのデザインアセット。 |

### カードデザイン恒久保存時のファイル名規則
システム側で管理を容易にするため、以下の固定ファイル名にリネームされます。

*   `bgimgf.[ext]` : 表面 背景画像
*   `bgimgb.[ext]` : 裏面 背景画像
*   `thumbf.webp` : 表面 サムネイル
*   `thumbb.webp` : 裏面 サムネイル

