/**
 * ファイル概要: 画像リサイズ・最適化ユーティリティ (Image Processing Utility)
 * 
 * 役割:
 * クライアントサイドでの画像アップロード時に、サーバー負荷とストレージ使用量を削減するため、
 * 画像のリサイズおよび WebP 形式への変換を行います。
 * 
 * 処理仕様:
 * 1. 入力ファイルの MIME タイプが `image/` で始まるか確認。
 * 2. `1280x1280` の範囲内に収まるよう、アスペクト比を維持したままリサイズ。
 * 3. `Canvas API` を使用してリサンプリング。
 * 4. 画質 0.85 の `WebP` 形式として Blob を出力。
 */

/**
 * 画像ファイルをリサイズし、WebP 形式の Blob に変換します。
 * 
 * @param file アップロードされた File オブジェクト
 * @param maxWidth リサイズ後の最大長辺 (デフォルト: 1280)
 * @returns 変換後の Blob オブジェクト、または非画像ファイルの場合はそのまま
 */
export const resizeImage = (file: File, maxWidth: number = 1280): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        // 画像でない場合はリサイズ処理をスキップしてそのまま返す
        if (!file.type.startsWith('image/')) {
            return resolve(file);
        }

        const img = new Image();
        // ブラウザの Blob URL を生成してメモリから読み込み
        img.src = URL.createObjectURL(file);
        
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            /**
             * 長辺が maxWidth を超える場合のみ、アスペクト比を維持して縮小計算を行う
             * (1280x1280のバウンディングボックス内に収める処理)
             */
            if (width > maxWidth || height > maxWidth) {
                if (width > height) {
                    // 横長の場合
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                } else {
                    // 縦長または正方形の場合
                    width = (width * maxWidth) / height;
                    height = maxWidth;
                }
            }

            // キャンバス要素を作業領域として作成
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                URL.revokeObjectURL(img.src);
                return reject(new Error("Canvas context selection failed"));
            }

            // 画像の描画 (補間アルゴリズムはブラウザ標準のものを使用)
            ctx.drawImage(img, 0, 0, width, height);

            /**
             * canvas から Blob への書き出し
             * フォーマット: image/webp
             * 品質: 0.85 (画質とファイルサイズのバランス重視)
             */
            canvas.toBlob((blob) => {
                // メモリ解放: URL オブジェクトの破棄
                URL.revokeObjectURL(img.src);
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error("Canvas to Blob conversion failed"));
                }
            }, "image/webp", 0.85);
        };

        // 読み込み失敗時のハンドリング
        img.onerror = (err) => {
            URL.revokeObjectURL(img.src);
            reject(err);
        };
    });
};

