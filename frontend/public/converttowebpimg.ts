import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

// --- 設定 ---
// const TARGET_DIR = 'C:\\git\\meishigawarini\\frontend\\public\\images\\manual'; // PNGが入っているフォルダ
const TARGET_DIR = '../documents/data'; // PNGが入っているフォルダ
const BACKUP_DIR_NAME = 'original_pngs'; // 移動先のフォルダ名
const QUALITY = 80; // WebPの画質 (0-100)

async function main() {
    try {
        const backupPath = path.join(TARGET_DIR, BACKUP_DIR_NAME);

        // 1. 移動先のフォルダが存在しない場合は作成
        try {
            await fs.access(backupPath);
        } catch {
            await fs.mkdir(backupPath, { recursive: true });
            console.log(`フォルダを作成しました: ${backupPath}`);
        }

        // 2. フォルダ内のファイル一覧を取得
        const files = await fs.readdir(TARGET_DIR);
        const pngFiles = files.filter(file => path.extname(file).toLowerCase() === '.png');

        if (pngFiles.length === 0) {
            console.log('PNGファイルが見つかりませんでした。');
            return;
        }

        console.log(`${pngFiles.length}個のファイルを処理します...`);

        // 3. 各ファイルを変換・移動
        for (const file of pngFiles) {
            const inputPath = path.join(TARGET_DIR, file);
            const baseName = path.parse(file).name;
            const outputPath = path.join(TARGET_DIR, `${baseName}.webp`);
            const movePath = path.join(backupPath, file);

            try {
                // WebPに変換して保存
                await sharp(inputPath)
                    .webp({ quality: QUALITY })
                    .toFile(outputPath);

                // 元のPNGファイルをバックアップフォルダへ移動
                await fs.rename(inputPath, movePath);

                console.log(`完了: ${file} -> ${baseName}.webp (元ファイルを移動済み)`);
            } catch (err) {
                console.error(`失敗 (${file}):`, err);
            }
        }

        console.log('\nすべての処理が完了しました。');
    } catch (error) {
        console.error('実行エラー:', error);
    }
}

main();