# マニュアル画像撮影用テンプレート (Screenshot Automation Blueprint)

このファイルは、マニュアルで使用する画像を自動操作で撮影するための詳細な手順書です。全てのボタン名称は `frontend/messages/ja.json` に準拠しています。

---

## 1. ユーザー共通 (User Manual)

| 画像パス | 対象URL | 撮影状態 / 操作手順 |
| :--- | :--- | :--- |
| `user_profile_edit.webp` | `/user/editprofile` | **[マイページ]** から **[あなたのプロフィール]** (`UserProfilePage.editProfile`) を選択した状態 |
| `user_history_list.webp` | `/user/sentmemory` | **[マイページ]** から **[贈ったギフト]** (`UserProfilePage.sendList`) を選択し、履歴が表示されている状態 |
| `user_delivery_settings.webp` | `/user/editdelivery` | **[マイページ]** から **[いつもの受け取り住所]** (`UserProfilePage.deliverySettings`) を選択した状態 |

---

## 2. ギフト受け取りフロー (Recipient Flow)

| 画像パス | 対象URL | 撮影状態 / 操作手順 |
| :--- | :--- | :--- |
| `receive-pin.webp` | `/receive/[uuid]` | QRコードをスキャンした直後のパスコード入力待機画面 |
| `receive-enter.webp` | `/receive/[uuid]` | 正しいPIN入力後、**[ギフトを見る]** を押して表示されるお届け先住所入力フォーム |
| `receive-submit.webp` | `/receive/[uuid]` | 住所入力後に **[この住所に配送する]** を押し、送信が完了した直後の「発送待ち」画面 |
| `receive-shipped.webp` | `/receive/[uuid]` | ショップ側で発送処理が完了した後の「発送済み」表示画面 |
| `receive-completed.webp` | `/receive/[uuid]` | 受取人による **[受け取り完了]** 報告後のアーカイブ表示画面 |
| `receive-invalid.webp` | `/receive/[uuid]` | 未有効化またはBAN状態のカードを読み取った際のエラー画面 |

---

## 3. ショップ管理者 (Shop Manager Manual)

| 画像パス | 対象URL | 撮影状態 / 操作手順 |
| :--- | :--- | :--- |
| `shopadmin-header.webp` | `/shop/[id]` | ショップ管理画面のヘッダー部分（ショップ名やオーナー情報が表示されている場所） |
| `shopadmin-activate.webp` | `/shop/[id]` | **[アクティベーション]** (`ShopPage.tabs.activation`) タブを選択し、スキャン待機中の状態 |
| `shopadmin-addproduct.webp` | `/shop/[id]` | **[商品登録]** (`ShopPage.tabs.products`) タブ内の **[商品追加]** (`ShopPage.addProduct.title`) ダイアログを開いた状態 |
| `shopadmin-list1.webp` | `/shop/[id]` | **[カード・受注管理]** (`ShopPage.tabs.shipping`) タブを選択し、注文一覧が表示されている状態 |
| `shopadmin-shopsetting.webp` | `/shop/[id]` | **[ショップ設定]** (`ShopPage.shopSettings.title`) ボタンを押し、設定編集画面が表示されている状態 |

---

## 4. システム管理者 (System Admin Manual)

| 画像パス | 対象URL | 撮影状態 / 操作手順 |
| :--- | :--- | :--- |
| `admin-dashboard.webp` | `/admin` | 管理ダッシュボードのトップ画面 |
| `admin-shops.webp` | `/admin` | **[ショップ管理]** (`AdminPage.tabs.shops`) タブを選択し、提携ショップ一覧が表示されている状態 |
| `admin-designs.webp` | `/admin` | **[デザイン設定]** (`AdminPage.tabs.designs`) タブを選択し、カードデザイン一覧が表示されている状態 |
| `admin-cardorders.webp` | `/admin` | **[カード印刷]** (`AdminPage.tabs.cardorders`) タブを選択し、各ショップからの発注一覧が表示されている状態 |
| `admin-tools.webp` | `/admin` | **[ツール]** (`AdminPage.tabs.tools`) タブを選択し、データメンテ用ツールが並んでいる状態 |

---

## 5. 全体フロー用イメージ (Global Flow)

これらの画像は、実際の操作画面だけでなく、利用シーンを補足するイメージとして使用されます。

| 画像パス | 推奨撮影内容 |
| :--- | :--- |
| `flow_step1_purchase.png` | ショップでのカード購入シーン（またはカード発注画面） |
| `flow_step3_scan.png` | スマートフォンで実際にカード裏面のQRをスキャンしている手元の様子 |
| `flow_step5_receive.png` | 届いたギフトパッケージを開封しているイメージ |

---

### 注意事項
- **秘匿情報**: 撮影時にはテスト用のダミーデータを使用し、実在する個人情報や本番環境のキーが表示されないよう注意してください。
- **デバイスサイズ**: PCビューとモバイルビューの両方で、マニュアルの文脈に最も適したサイズで撮影してください（特に受け取りフローはモバイル推奨）。
- **翻訳**: 全てのボタン名はブラウザの言語設定を「日本語」にした状態で撮影してください。
