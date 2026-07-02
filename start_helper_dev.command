#!/bin/bash

# スクリプトの親ディレクトリに移動
cd "$(dirname "$0")"

echo "=========================================="
echo "  名刺代わりに: 開発プレビューサーバー起動"
echo "=========================================="

# 1. リポジトリを最新に同期
echo "最新のデータを取得中 (git pull)..."
git checkout main
git pull origin main

# 2. ブランチの切り替え（日付名でブランチを作成）
BRANCH_NAME="update-help-$(date +%Y%m%d)"
echo "新しい作業用ブランチ [${BRANCH_NAME}] を作成・移動します..."
git checkout -b ${BRANCH_NAME} 2>/dev/null || git checkout ${BRANCH_NAME}

# 3. バックグラウンドで3秒後にブラウザでプレビューページを開く
(sleep 3 && open "http://localhost:3000/") &

# 4. フロントエンドディレクトリに移動し、サーバーを起動
echo "依存パッケージをチェック中..."
cd frontend
npm install

echo "開発サーバーを起動しています..."
npm run dev
