#!/bin/bash

# スクリプトの親ディレクトリに移動
cd "$(dirname "$0")"

echo "=========================================="
echo "  名刺代わりに: 変更内容の送信 (Git Push)"
echo "=========================================="

# 現在のブランチ名を取得
CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null)

if [ -z "$CURRENT_BRANCH" ]; then
  echo "エラー: 現在のブランチ名が取得できませんでした。"
  read -p "Enterキーを押して終了します..."
  exit 1
fi

if [ "$CURRENT_BRANCH" = "master" ]; then
  echo "警告: 現在 master ブランチにいます。変更を送信する前に、まず start_helper_dev.command を実行して作業用ブランチを作成してください。"
  read -p "Enterキーを押して終了します..."
  exit 1
fi

# 1. 変更ファイルのステージングと確認
echo "変更があったファイルを検出しています..."
git add .
git status

echo "------------------------------------------"

# 2. コミットメッセージの入力
read -p "どのような変更を行いましたか？（例: ログイン手順のヘルプを追加）: " COMMIT_MSG
if [ -z "$COMMIT_MSG" ]; then
  COMMIT_MSG="ヘルプページの更新"
fi

# 3. コミット
git commit -m "$COMMIT_MSG"

# 4. GitHubへのプッシュ
echo "GitHubへ送信中..."
git push origin "$CURRENT_BRANCH"

if [ $? -eq 0 ]; then
  echo "------------------------------------------"
  echo "送信が完了しました！"
  
  # リポジトリのURLを取得（GitHub用のプルリクエストURLを作成）
  REMOTE_URL=$(git config --get remote.origin.url)
  # git@github.com:user/repo.git または https://github.com/user/repo.git を https://github.com/user/repo に変換
  REPO_URL=$(echo "$REMOTE_URL" | sed -e 's/git@github.com:/https:\/\/github.com\//' -e 's/\.git$//')
  
  PR_URL="${REPO_URL}/compare/master...${CURRENT_BRANCH}?expand=1"
  
  echo "ブラウザでプルリクエスト作成画面を開きます..."
  echo "URL: $PR_URL"
  open "$PR_URL"
else
  echo "エラー: 送信に失敗しました。認証設定やインターネット接続を確認してください。"
fi

read -p "Enterキーを押して終了します..."
