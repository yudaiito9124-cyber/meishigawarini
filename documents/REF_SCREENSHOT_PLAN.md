# Screenshot Automation Plan & Source of Truth

This document serves as the absolute reference for the LLM-based automation agent to capture UI screenshots. 
It contains the necessary navigation paths, triggers, and state requirements for exhaustive documentation.

## Consolidated Maintenance Prompt (Original User Intent)

> [!IMPORTANT]
> Use the following bulleted list as the meta-prompt for regenerating or extending this file. These instructions are derived from the original feature requests to ensure 100% adherence to the user's intent.

### Navigation & Coverage Intent
- **Atomic One-Line Completion**: Every instruction must be a single, self-contained line. The agent must be able to complete the navigation and capture in one go.
- **Full Path Specification**: Always list the full URL path for every entry.
- **Instruction Precision**: Clearly describe the operation required to open tabs or dialogs. Use exact button names and labels from the translation files (`next-intl`) to ensure they are uniquely identifiable by the LLM.
- **Frontend Script Audit**: Carefully check the frontend source code (`page.tsx` and components) to ensure complex UI transitions and all interactive triggers are mapped.
- **100% Comprehensive Coverage**: Every page, sub-tab, and dialog in the application must be included. No "missing" items are allowed.
- **Exclusion Criteria**: Omit trivial changes (e.g., standard checkmarks, form field highlight errors) unless they involve custom-built dialogs or special UI states (e.g., banned QR error screens).
- **Device Independence**: Focus on the standard responsive layout; device-specific views (Mobile vs Desktop) do not need separate entries.

### State & Variable Intent
- **Dynamic State Mapping**: For pages like `ReceivePage` and `AdminPage` where the UI changes based on data state, use state-specific placeholders (e.g., `[qr_id_ban]`, `[qr_id_completed]`).
- **Variable Definitions**: All placeholders used in the table must be defined in a dedicated section at the top of the document, explaining the meaning of each state.

### Filename Generation Intent
- **Structured Separators**:
    - **Path-Parameter Divider**: Use **`++`** (e.g., `filepath++param=val`).
    - **Parameter-Value Separator**: Use **`=`** (e.g., `TAB=activation`).
    - **Parameter-Parameter Joiner**: Use **`+`** (e.g., `TAB=activation+DIALOG=scanner`).
- **Path Separation**:
    - **`/` to `_` Conversion**: Replace `/` with `_` in the `filepath` part if a path parameter exists (e.g., `/shop/[shopId]` -> `shop_[shopId]`). Maintain `_` for standard paths as well for consistency.
- **No Special Characters**: Avoid illegal characters like `?`, `&`, or `*`.

---

## State Variable Definitions

| Variable | Description |
| :--- | :--- |
| `qr_id_pin` | A QR ID requiring a PIN entry (Step 1). |
| `qr_id_active` | A QR ID that is activated but card info is not yet submitted (Step 2/5). |
| `qr_id_used` | A QR ID submitted by a user, awaiting shipment from the shop (Status: USED). |
| `qr_id_shipped` | A QR ID for a product that has been shipped (Step 8). |
| `qr_id_completed` | A QR ID for a completed cycle (Step 10). |
| `qr_id_expired` | A QR ID that has reached its expiration date. |
| `qr_id_ban` | A QR ID that has been Banned by an admin. |
| `shopId` | A Shop ID with active products and orders. |
| `product_id` | A valid Product ID within the shop. |
| `order_id_open` | A Card Order ID with status `ORDERED`. |

---

## Atomic Instruction Table

<!-- STEPS_START -->

| Path | Navigation & Capture Instruction (LLM Prompt) | Target Filename |
| :--- | :--- | :--- |
| `/` | Hero section: Initial landing page view with CTA. | `landing.webp` |
#| `/` | Hero section: Initial landing page view with CTA. | `landing++SECTION=hero.webp` |
#| `/` | Steps section: Scroll down to "たった3ステップ" (`HomePage.steps`) area. | `landing++SECTION=steps.webp` |
#| `/` | Use Cases: Scroll down to "こんな場面で使えます" area. | `landing++SECTION=usecases.webp` |
#| `/` | Features section: Scroll down to "名刺代わりに。の3つの特徴" area. | `landing++SECTION=features.webp` |
#| `/` | Supported Shops: Scroll down to "対応ショップ" section. | `landing++SECTION=shops.webp` |
#| `/` | Footer section: Scroll to the bottom of the landing page. | `landing++SECTION=footer.webp` |
#| `/login` | Login Form: Initial email/password entry view. | `login.webp` |
#| `/login` | Login Form: Initial email/password entry view. | `login++STEP=form.webp` |
#| `/login` | MFA Challenge: After entering credentials, show TOTP input (`LoginPage.mfaCodeLabel`). | `login++STEP=mfa.webp` |
#| `/login` | Post-Login Selection: Hub screen for Multi-role/Shop owners (`LoginPage.selectionTitle`). | `login++STEP=selection.webp` |
#| `/login` | Error State: Form showing "Invalid credentials" (`LoginPage.errors.notAuthorized`). | `login++ERROR=invalid.webp` |
#| `/register` | Registration Form: New account signup view. | `register.webp` |
#| `/register` | Registration Form: New account signup view. | `register++STEP=form.webp` |
#| `/register` | Success State: "Registration Complete" success card (`RegisterPage.successTitle`). | `register++STEP=success.webp` |
#| `/verify` | Email Verification: Code entry page after registration. | `verify.webp` |
#| `/mfa-setup` | Multi-factor authentication setup screen. | `mfa_setup.webp` |

| `/user` | User Dashboard hub. View profile cards. | `user.webp` |
| `/user/editprofile` | Profile editing form. | `user_editprofile.webp` |
| `/user/editdelivery` | Address management / Delivery settings. | `user_editdelivery.webp` |
| `/user/sendgift` | Bulk scan initial screen: Start Scan button (`UserProfilePage.bulkScan.startScanButton`). | `user_sendgift.webp` |
| `/user/sendgift` | Bulk scan input mode: Click "Manual Input" button (`UserProfilePage.bulkScan.manualInputButton`). | `user_sendgift++DIALOG=manual_input.webp` |
| `/user/sendgift` | Bulk scan intermediate list: Add a few IDs manually then show the pre-confirmation list. | `user_sendgift++STEP=scanned_list.webp` |
| `/user/sendgift` | Bulk scan confirmation: Click "紐付けを確認する" (`UserProfilePage.bulkScan.confirmButton`) to show final confirmation list. | `user_sendgift++STEP=confirm.webp` |
| `/user/sendgift` | Bulk scan processing: Overlay showing progress bar and percentages. | `user_sendgift++STEP=processing.webp` |
| `/user/sendgift` | Bulk scan result: Show final success report (`UserProfilePage.bulkScan.successReport`). | `user_sendgift++STEP=result.webp` |

| `/user/receivedmemory`| Received list: Standard view (Stack/Fan-out mode). | `user_receivedmemory++MODE=stack.webp` |
| `/user/receivedmemory`| Received list: Click "Grid View" toggle icon. | `user_receivedmemory++MODE=grid.webp` |
| `/user/receivedmemory`| Received details: Click a card to trigger 3D Flip (Back side). | `user_receivedmemory++DIALOG=flip_detail.webp` |
| `/user/sentmemory` | Sent list: Standard view (Stack/Fan-out mode). | `user_sentmemory++MODE=stack.webp` |
| `/user/sentmemory` | Sent list: Click "Grid View" toggle icon. | `user_sentmemory++MODE=grid.webp` |
| `/user/sentmemory` | Sent details: Click a card to trigger 3D Flip (Back side). | `user_sentmemory++DIALOG=flip_detail.webp` |
| `/shop` | Shop selection screen (List of managed shops). | `shop.webp` |
＃| `/shop/[shopId]` | Activation Flow: Click "有効化" (`ShopPage.tabs.activation`) tab. | `shop_[shopId]++TAB=activation.webp` |
＃| `/shop/[shopId]` | Activation Flow: Click "QRコードをスキャン" (`ShopPage.linkQr.scan`) to open scanner. | `shop_[shopId]++TAB=activation+DIALOG=scanner.webp` |
＃| `/shop/[shopId]` | Activation Flow: In scanner, click "手動入力？" (`ShopPage.linkQr.manualinput`) button. | `shop_[shopId]++TAB=activation+DIALOG=scanner+MODE=manual.webp` |
＃| `/shop/[shopId]` | Activation Flow: After scan/input, show Product Linking Form (`ShopPage.linkQr.title`). | `shop_[shopId]++TAB=activation+STEP=link_form.webp` |
＃| `/shop/[shopId]` | Activation Flow: Click "オプション(必要に応じて)" (`ShopPage.linkQr.option`) to expand memo fields. | `shop_[shopId]++TAB=activation+STEP=link_form+OPTIONS=expanded.webp` |
＃| `/shop/[shopId]` | Dashboard: Click "カード・受注管理" (`ShopPage.tabs.shipping`) tab. | `shop_[shopId]++TAB=shipping.webp` |
＃| `/shop/[shopId]` | Shipping Details: Click an order row to open Order Details dialog (`OrderRow`). | `shop_[shopId]++TAB=shipping+DIALOG=order_details.webp` |
＃| `/shop/[shopId]` | Shipping Action: In Detail dialog for `USED` order, scroll to "発送処理" (`ShopPage.orders.action`). | `shop_[shopId]++TAB=shipping+DIALOG=order_details+SECTION=ship_form.webp` |
＃| `/shop/[shopId]` | Column Setup: Click Gear icon in Shipping table header to open "表示設定" (`ShopPage.orders.columnSettings`). | `shop_[shopId]++TAB=shipping+DIALOG=column_settings.webp` |
＃| `/shop/[shopId]` | Status Legend: View "ステータスガイド" (`ShopPage.statusGuide.title`) at the bottom of the page. | `shop_[shopId]++TAB=shipping+SECTION=status_guide.webp` |
＃| `/shop/[shopId]` | Dashboard: Click "商品登録" (`ShopPage.tabs.products`) tab. | `shop_[shopId]++TAB=products.webp` |
＃| `/shop/[shopId]` | Product Wizard: Click "商品追加" (`ShopPage.addProduct.title`) card to open dialog. | `shop_[shopId]++TAB=products+DIALOG=add_product.webp` |
＃| `/shop/[shopId]` | Product Wizard: In Add Product dialog, click "商品を一括インポート" (`ShopPage.importProduct.button`) button. | `shop_[shopId]++TAB=products+DIALOG=add_product+DIALOG=import.webp` |
＃| `/shop/[shopId]` | Product Wizard: Click a Product Card to open "商品編集" (`ShopPage.editProduct.title`). | `shop_[shopId]++TAB=products+DIALOG=product_edit.webp` |
＃| `/shop/[shopId]` | Dashboard: Click "カード発注" (`ShopPage.tabs.orderCard`) tab. | `shop_[shopId]++TAB=ordercard.webp` |
＃| `/shop/[shopId]` | Card Order: Click "この内容で発注する" (`ShopPage.cardOrder.placeOrder`) to see "発注の最終確認" (`ShopPage.cardOrder.confirmTitle`). | `shop_[shopId]++TAB=ordercard+DIALOG=confirm_order.webp` |
＃| `/shop/[shopId]` | Card Order: View "発注履歴" (`ShopPage.cardOrder.historyTitle`) section at the bottom. | `shop_[shopId]++TAB=ordercard+SECTION=history.webp` |
＃| `/shop/[shopId]` | Settings: Click Gear icon in header to open "ショップ設定" (`ShopPage.shopSettings.title`). | `shop_[shopId]++DIALOG=shop_settings.webp` |
＃| `/shop/[shopId]` | Settings: In Shop Settings, click "ソースコード" (`ShopPage.shopSettings.sourcecode`) toggle for HTML editor. | `shop_[shopId]++DIALOG=shop_settings+MODE=editor.webp` |
| `/admin` | Admin Hub: Dashboard screen with aggregate stats. | `admin.webp` |
| `/admin` | QR Management: Click "カード一覧" (`AdminPage.tabs.qrcodes`) tab. | `admin/admin++TAB=qrcodes.webp` |
| `/admin` | QR Filters: In QR Codes tab, view "カードIDで絞り込み..." (`AdminPage.list.keyword.placeholder`) search field. | `admin/admin++TAB=qrcodes+SECTION=search.webp` |
| `/admin` | Order Management: Click "カード印刷" (`AdminPage.tabs.cardorders`) tab. | `admin/admin++TAB=cardorders.webp` |
| `/admin` | Card Printing: Browse "PDF生成用の用紙設定" (`AdminPage.generate.paperFormat`) options. | `admin/admin++TAB=cardorders+SECTION=paper_config.webp` |
| `/admin` | Card Printing: Toggle "オプション情報を使用する" (`AdminPage.generate.useMetadata`) switch. | `admin/admin++TAB=cardorders+SECTION=generate_form+METADATA=true.webp` |
| `/admin` | Design Management: Click "デザイン設定" (`AdminPage.tabs.designs`) tab. | `admin/admin++TAB=designs.webp` |
| `/admin` | Shop Management: Click "ショップ管理" (`AdminPage.tabs.shops`) tab. | `admin/admin++TAB=shops.webp` |
| `/admin` | Tools: Click "ツール" (`AdminPage.tabs.tools`) tab. | `admin/admin++TAB=tools.webp` |
| `/admin` | QR Details: Click a row in QR list to open `QRCodeDetailsDialog`. | `admin/admin++DIALOG=qr_details.webp` |
| `/admin` | Order Details: Click a row in Order list to open `OrderDetailsDialog`. | `admin/admin++DIALOG=order_details.webp` |
| `/admin` | Manager Linking: In Shops tab, scroll to "管理者紐付け" section. | `admin/admin++TAB=shops+SECTION=manager_link.webp` |
| `/admin` | Owner Change: In Shops tab, scroll to "ショップオーナー変更" section. | `admin/admin++TAB=shops+SECTION=owner_change.webp` |
| `/admin` | Shop Creation: In Shops tab, scroll to "ショップ新規作成(システム管理者のみ)" (`ShopListPage.createShop`). | `admin/admin++TAB=shops+SECTION=shop_creation.webp` |
| `/admin` | Design Assignment: In Shops tab, scroll to "ショップカードデザイン設定" section. | `admin/admin++TAB=shops+SECTION=design_link.webp` |
| `/admin` | Editor: Click "新規作成" or "編集" in Designs tab to open `CardDesignEditor`. | `admin/admin++DIALOG=design_editor.webp` |
| `/admin` | Tools: In Tools tab, view "現在手動生成したカード" (`AdminPage.batches.title`) area. | `admin/admin++TAB=tools+SECTION=data_dump.webp` |
| `/admin/help` | Admin Help / Maintenance guide list. | `admin_help.webp` |
＃| `/receive/[qr_id_active]` | Role Selection: If logged in, click "あなたはどちらですか？" (`ReceivePage.titles.selectRole`) buttons. | `receive_[qr_id]++DIALOG=role_selection.webp` |
＃| `/receive/[qr_id_pin]` | Step 1: PIN Input screen ("ギフトを受け取るにはPINコードを入力してください"). | `receive_[qr_id]++STEP=1.webp` |
＃| `/receive/[qr_id_active]` | Step 2/3: Product Information / Profile form ("ギフトを配送してほしい住所をお知らせください"). | `receive_[qr_id]++STEP=2_form.webp` |
＃| `/receive/[qr_id_active]` | Sender Info: View "送り主" (`ReceivePage.senderInfo.title`) card content. | `receive_[qr_id]++SECTION=sender_info.webp` |
＃| `/receive/[qr_id_active]` | Sender Edit: Click "名刺を更新する" (`ReceivePage.senderInfo.update`) to open Editor. | `receive_[qr_id]++DIALOG=sender_edit.webp` |
＃| `/receive/[qr_id_active]` | Profile Details Edit: In Profile Editor, click "詳細設定" (`ReceivePage.senderInfo.labels.addhtmlmessage`) to expand HTML editor. | `receive_[qr_id]++DIALOG=sender_edit+SECTION=html_editor.webp` |
＃| `/receive/[qr_id_active]` | Step 5: Address/Shipping Information entry (`ReceivePage.formStep.title`). | `receive_[qr_id]++STEP=5_address.webp` |
＃| `/receive/[qr_id_active]` | Step 6: Confirmation of submitted data (`ReceivePage.titles.success`). | `receive_[qr_id]++STEP=6_confirm.webp` |
＃| `/receive/[qr_id_active]` | Step 6: View Overlay Loader during submission (`ReceivePage.formStep.submitting`). | `receive_[qr_id]++STEP=6_confirm+LOADING=true.webp` |
＃| `/receive/[qr_id_active]` | Chat: Scroll to "メッセージチャット" (`ReceivePage.chat.title`) at the bottom. | `receive_[qr_id]++SECTION=chat.webp` |
＃| `/receive/[qr_id_active]` | Chat: Select a file to see "アップロード中..." (`ReceivePage.chat.uploading`) or file preview. | `receive_[qr_id]++SECTION=chat+STATUS=uploading.webp` |
＃| `/receive/[qr_id_active]` | Share: Click "記録をシェアする" (`ReceivePage.share.button`) to open dialog. | `receive_[qr_id]++DIALOG=share.webp` |
＃| `/receive/[qr_id_shipped]` | Step 8: Shipping initiated ("ギフトが発送されました"). | `receive_[qr_id]++STEP=8_shipped.webp` |
＃| `/receive/[qr_id_completed]`| Step 10: Final Success state ("ギフトをお楽しみください"). | `receive_[qr_id]++STEP=10_success.webp` |
＃| `/receive/[qr_id_completed]`| Memory Section: View "思い出の記録" (`ReceivePage.memorySection.title`). | `receive_[qr_id]++SECTION=memory.webp` |
＃| `/receive/[qr_id_expired]` | Error state: Display showing the QR has expired (`ReceivePage.titles.expired`). | `receive_[qr_id]++ERROR=expired.webp` |
＃| `/receive/[qr_id_pin]` | PIN Locked: Display after 5 failed attempts (`ReceivePage.pinStep.label` mention of lock). | `receive_[qr_id]++ERROR=pin_locked.webp` |
＃| `/receive/[qr_id_ban]` | Error state: Display showing the QR has been banned (`Status.banned`). | `receive_[qr_id]++ERROR=banned.webp` |
＃| `/share/[qr_id]` | Showcase: Landing view with product description. | `share_[qr_id].webp` |
＃| `/share/[qr_id]` | Showcase Details: Card click triggering flip to show back side. | `share_[qr_id]++DIALOG=flip_detail.webp` |
| `/help` | General Help hub index. | `help.webp` |
| `[All]` | Mobile Sidebar: Click the hamburger menu to open navigation sidebar. | `common++SIDEBAR=open.webp` |

<!-- STEPS_END -->

