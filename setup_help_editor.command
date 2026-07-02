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

# 3. リポジトリのクローン
if [ ! -d "meishigawarini" ]; then
  echo "リポジトリをダウンロード（クローン）しています..."
  git clone "$REPO_URL" meishigawarini
  if [ $? -ne 0 ]; then
    echo "⚠️ エラー: ダウンロードに失敗しました。"
    echo "GitHubアカウントの権限設定や、認証設定（GitHub Desktopでのログイン等）が完了しているか確認してください。"
    read -p "Enterキーを押して終了します..."
    exit 1
  fi
else
  echo "既にリポジトリが存在します。スキップします。"
fi

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
