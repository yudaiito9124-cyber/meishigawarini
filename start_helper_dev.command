#!/bin/bash

# スクリプトの親ディレクトリに移動
cd "$(dirname "$0")"

echo "=========================================="
echo "  名刺代わりに: 開発プレビューサーバー起動"
echo "=========================================="

# 1. バックグラウンドで3秒後にブラウザでプレビューページを開く
(sleep 3 && open "http://localhost:3000") &

# 2. VS Codeでプロジェクトフォルダを開く
echo "VS Code を起動しています..."
if open -a "Visual Studio Code" . 2>/dev/null; then
  echo "VS Code でプロジェクトを開きました。"
else
  echo "Visual Studio Code が見つかりませんでした。手動でエディタを開いてください。"
fi

# 3. フロントエンドディレクトリに移動し、サーバーを起動
echo "依存パッケージをチェック中..."
cd frontend
npm install

echo "開発サーバーを起動しています..."
npm run dev
