#!/bin/bash

# スクリプトがあるディレクトリに移動
cd "$(dirname "$0")"

# デスクトップ上に「名刺代わりに_ヘルプ編集」フォルダを作成
WORKDIR="${HOME}/Desktop/名刺代わりに_ヘルプ編集"
REPO_URL="https://github.com/yudaiito9124-cyber/meishigawarini.git"

echo "=========================================="
echo "  名刺代わりに: ヘルプ編集環境セットアップ"
echo "=========================================="

# 1. 動作要件のチェック
echo "システムチェックを実行中..."

# Gitチェック
if ! command -v git &> /dev/null; then
  echo "⚠️ エラー: Git がインストールされていません。"
  echo "GitHub Desktop (https://desktop.github.com/) などをインストールし、"
  echo "GitHubへのログインと認証を済ませてから、再度このスクリプトを実行してください。"
  echo "（ターミナルで git コマンドが使える状態にする必要があります）"
  read -p "Enterキーを押して終了します..."
  exit 1
fi

# Node.jsチェック
if ! command -v node &> /dev/null; then
  echo "⚠️ 警告: Node.js がインストールされていません。"
  echo "ローカルで表示を確認するには Node.js が必要です。あらかじめインストールしておいてください。"
  echo "ダウンロード先: https://nodejs.org/"
  echo "------------------------------------------"
fi

# 2. 作業用フォルダの作成
echo "デスクトップ上に作業フォルダを作成します..."
mkdir -p "$WORKDIR"
cd "$WORKDIR" || exit 1

# 3. リポジトリのクローンと最新の main ブランチの取得
if [ ! -d "meishigawarini" ]; then
  echo "リポジトリをダウンロード（クローン）しています..."
  git clone "$REPO_URL" meishigawarini
  if [ $? -ne 0 ]; then
    echo "⚠️ エラー: ダウンロードに失敗しました。"
    echo "GitHubアカウントの権限設定や、認証設定（GitHub Desktopでのログイン等）が完了しているか確認してください。"
    read -p "Enterキーを押して終了します..."
    exit 1
  fi
fi

# 確実に master ブランチへ切り替えて最新化し、作業用ブランチを作成する
cd meishigawarini || exit 1

# 現在のブランチ名を取得
CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null)

if [ -n "$CURRENT_BRANCH" ] && [ "$CURRENT_BRANCH" != "master" ]; then
  echo "------------------------------------------"
  echo "⚠️ 前回の作業中のブランチ [${CURRENT_BRANCH}] が残っています。"
  echo "安全のため、前回の変更を自動コミットして GitHub へ送信（プッシュ）します..."

  # 未コミットの変更があるかチェック
  if [ -n "$(git status --porcelain)" ]; then
    git add .
    git commit -m "自動保存: セットアップ再実行による退避"
    HAS_CHANGES=1
  else
    HAS_CHANGES=0
  fi

  # プッシュを実行
  echo "GitHubへ前回の変更を送信中..."
  git push origin "$CURRENT_BRANCH"

  if [ $? -eq 0 ] && [ "$HAS_CHANGES" -eq 1 ]; then
    # プルリクエストのURLを取得してブラウザで開く
    REMOTE_URL=$(git config --get remote.origin.url)
    REPO_URL_HTML=$(echo "$REMOTE_URL" | sed -e 's/git@github.com:/https:\/\/github.com\//' -e 's/\.git$//')
    PR_URL="${REPO_URL_HTML}/compare/master...${CURRENT_BRANCH}?expand=1"
    echo "前回の作業のプルリクエスト作成画面を開きます..."
    open "$PR_URL"
  fi

  # master に戻って古いブランチを削除
  echo "ローカルの古い作業用ブランチを削除します..."
  git checkout master
  git branch -D "$CURRENT_BRANCH"
  echo "古いブランチの片付けが完了しました。"
  echo "------------------------------------------"
else
  # 安全のため master に切り替え
  git checkout master
fi

# master の最新データを同期
echo "最新のマスター(master)ブランチを同期しています..."
git pull origin master

# 日付ベースの新しい作業ブランチを作成して切り替える
BRANCH_NAME="update-help-$(date +%Y%m%d)"
echo "新しい作業用ブランチ [${BRANCH_NAME}] を作成・移動します..."
git checkout -b "${BRANCH_NAME}" 2>/dev/null || git checkout "${BRANCH_NAME}"
cd ..


# 4. ショートカット（シンボリックリンク）の作成
echo "フォルダのショートカットを作成しています..."
ln -sfn "meishigawarini/frontend/content/help/ja" "${WORKDIR}/ヘルプ記事フォルダ"
ln -sfn "meishigawarini/frontend/public/images/manual" "${WORKDIR}/画像フォルダ"

# 5. コマンドファイルのラッパー（ショートカットの代わり）を作成
echo "起動・送信スクリプトをセットアップしています..."

# プレビュー起動スクリプト
cat << 'EOF' > "${WORKDIR}/1_ヘルプを編集・確認する.command"
#!/bin/bash
cd "$(dirname "$0")"
if [ -f "./meishigawarini/start_helper_dev.command" ]; then
  bash ./meishigawarini/start_helper_dev.command
else
  echo "エラー: 起動スクリプトが見つかりません。フォルダ構成を確認してください。"
  read -p "Enterキーを押して終了します..."
fi
EOF
chmod +x "${WORKDIR}/1_ヘルプを編集・確認する.command"

# 送信スクリプト
cat << 'EOF' > "${WORKDIR}/2_変更を送信する.command"
#!/bin/bash
cd "$(dirname "$0")"
if [ -f "./meishigawarini/submit_helper_changes.command" ]; then
  bash ./meishigawarini/submit_helper_changes.command
else
  echo "エラー: 送信スクリプトが見つかりません。フォルダ構成を確認してください。"
  read -p "Enterキーを押して終了します..."
fi
EOF
chmod +x "${WORKDIR}/2_変更を送信する.command"

echo "=========================================="
echo " セットアップが完了しました！"
echo " デスクトップに「名刺代わりに_ヘルプ編集」フォルダが作成されました。"
echo " フォルダ内のショートカットやスクリプトをご利用ください。"
echo "=========================================="
read -p "Enterキーを押して終了します..."
