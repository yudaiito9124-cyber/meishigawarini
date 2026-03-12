/**
 * ファイル概要: 画像リサイズユーティリティ
 * 目的: アップロードされる画像の長辺または短辺の長いほうが1280になるように(1280x1280の範囲に収まる)、
 * かつ縦横比が維持されるようにリサイズ処理を行います。
 */

export const resizeImage = (file: File, maxWidth: number = 1280): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            return resolve(file); // 画像でない場合はそのまま返す
        }

        const img = new Image();
        img.src = URL.createObjectURL(file);
        
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            // 長辺または短辺の長いほうがMaxWidthを超える場合のみリサイズ
            // (1280x1280の範囲に収まるように)
            if (width > maxWidth || height > maxWidth) {
                if (width > height) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                } else {
                    width = (width * maxWidth) / height;
                    height = maxWidth;
                }
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                URL.revokeObjectURL(img.src);
                return reject(new Error("Canvas context selection failed"));
            }

            // 画像の描画（アスペクト比は上記計算で維持されている）
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                URL.revokeObjectURL(img.src);
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error("Canvas to Blob conversion failed"));
                }
            }, file.type, 0.85); // 品質0.85でBlob化
        };

        img.onerror = (err) => {
            URL.revokeObjectURL(img.src);
            reject(err);
        };
    });
};
