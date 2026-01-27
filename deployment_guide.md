# インターネット公開手順 (デプロイガイド)

現在、バックエンドはAWS CDKで構築・デプロイされていますが、フロントエンド（Next.js）はまだインターネット上に公開されていません。
`app/[id]/page.tsx` などの動的ルートを使用しているため、**AWS Amplify** を使用するのが最も簡単で確実な方法です。

## 1. フロントエンドのデプロイ (AWS Amplify)

### 手順

1.  **GitHubへプッシュ**
    - 最新のコードがGitHubリポジトリ (`yudaiito9124-cyber/meishigawarini`) にプッシュされていることを確認してください。

2.  **AWSコンソールでAmplifyを開く**
    - [AWS Amplify コンソール](https://ap-northeast-1.console.aws.amazon.com/amplify/home?region=ap-northeast-1) にアクセスします。

3.  **新規アプリケーション作成**
    - 画面上の「新しいアプリを作成」ボタンを押し、「GitHub」を選択して「次へ」をクリックします。

4.  **リポジトリの接続**
    - `meishigawarini` リポジトリを選択します。
    - ブランチ（通常は `main`）を選択し、「次へ」をクリックします。

5.  **ビルド設定**
    - Amplifyが自動的に `Next.js` プロジェクトであることを認識します。設定はデフォルトのままで問題ありません。
    - **重要**: 「詳細設定」を開き、「環境変数」を追加してください。以下の値を設定します（バックエンドの情報を入力）。

    | キー | 値 |
    | :--- | :--- |
    | `NEXT_PUBLIC_API_URL` | `https://cs8f9x08p5.execute-api.ap-northeast-1.amazonaws.com/prod` |
    | `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | `ap-northeast-1_kdVaLx6Rn` |
    | `NEXT_PUBLIC_COGNITO_CLIENT_ID` | `2dusqokqmc8lfa1rpffv1gbuvv` |

    > ※ `NEXT_PUBLIC_COGNITO_REGION` はコード内で使用されていないようですが、念のため `ap-northeast-1` と設定しても構いません。

6.  **保存してデプロイ**
    - 設定を確認し、「保存してデプロイ」をクリックします。

7.  **完了**
    - デプロイが完了すると、AmplifyからURL（例: `https://main.xxxx.amplifyapp.com`）が発行されます。そのURLにアクセスして動作を確認してください。

## 2. バックエンドの更新について

バックエンドの構成（`infra/`）に変更を加えた場合は、以下のコマンドで適用します。

```bash
cd infra
npm run cdk deploy
```

バックエンドのデプロイが完了した後、もしAPIのURLやCognitoのIDが変わった場合は、Amplifyのコンソールで環境変数を更新し、再デプロイする必要があります（通常、InfraStackを削除しない限りIDは変わりません）。
