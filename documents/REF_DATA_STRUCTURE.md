# REF Data Structure (Role-Based)

このドキュメントでは、システムの主要なエンティティ間の関係を、操作の主体（ロール）ごとの視点で可視化しています。

---

## 1. User-Centric (ユーザー・履歴視点)

ユーザー（送り主・受取人）自身のアイデンティティと、プロフィール・設定・行動履歴に関連する構造です。

```mermaid
classDiagram
    class User_Identity["ユーザー認証情報 (User Identity)"] {
        <<PK: USER#user_id, SK: SHOP>>
        +String user_id (sub)
        +String email
        +Array owner_shop_ids
        +Array gm_shop_ids
    }

    class Sender_Profile["送り主プロフィール (Sender Profile)"] {
        <<PK: USER#user_id, SK: SENDER>>
        +String name (名前)
        +String job_title (役職)
        +String company (会社名)
        +String card_image_url (画像URL)
        +String detail_html (詳細HTML)
    }

    class Receiver_Default["配送先デフォルト (Receiver Default)"] {
        <<PK: USER#user_id, SK: RECEIVER>>
        +String name (受取人名)
        +String zipCode (郵便番号)
        +String address (住所)
        +String phone (電話番号)
    }

    class Activity_Log["行動履歴ログ (Activity Log)"] {
        <<PK: USER#user_id, SK: SENDLOG/RECEIVEDLOG#index>>
        +Array logs [qr_id, timestamp]
    }

    class Log_Metadata["履歴管理メタデータ (Log Metadata)"] {
        <<PK: USER#user_id, SK: SENDLOG/RECEIVEDLOG_META>>
        +Number current_index (現在位置)
        +Number current_count (現在の件数)
    }

    User_Identity "1" -- "0..1" Sender_Profile : プロフィール保持
    User_Identity "1" -- "0..1" Receiver_Default : 配送先デフォルト保持
    User_Identity "1" -- "*" Activity_Log : 履歴を記録
    Activity_Log "*" -- "1" Log_Metadata : メタデータで管理
```

---

## 2. Shop-Centric (ショップ・在庫管理視点)

ショップ運営者が管理する、店舗情報、商品カタログ、および紐付くギフト（QR）の構造です。

```mermaid
classDiagram
    class Shop_Metadata["ショップ情報 (Shop Metadata)"] {
        <<PK: SHOP#shop_id, SK: METADATA>>
        +String shop_id (ショップID)
        +String name (ショップ名)
        +String owner_id (オーナーID)
        +Array card_designs (許可デザイン)
    }

    class Product_Catalog["商品カタログ (Product)"] {
        <<PK: SHOP#shop_id, SK: PRODUCT#product_id>>
        +String product_id (商品ID)
        +String name (商品名)
        +String status (ステータス: ACTIVE/STOPPED)
        +Number price (価格)
        +String design_id (デフォルトデザイン)
    }

    class Managed_QR["管理対象QR (QR Metadata)"] {
        <<PK: QR#uuid, SK: METADATA>>
        <<GSI2: SHOP#shop_id>>
        +String status (ステータス)
        +String product_id (紐付け商品)
        +String ts_activated_at (有効化日時)
    }

    Shop_Metadata "1" -- "*" Product_Catalog : 商品を保持
    Shop_Metadata "1" -- "*" Managed_QR : GSI2で逆引き管理
    Product_Catalog "1" -- "*" Managed_QR : QRに割り当て
```

---

## 3. QR-Centric (取引・注文ハブ視点)

ギフト（QRコード）を核とした、受取人との取引、配送、およびコミュニケーションの構造です。

```mermaid
classDiagram
    class QR_Master["QR基本情報 (QR Metadata)"] {
        <<PK: QR#uuid, SK: METADATA>>
        +String pin (認証ピン)
        +String status (ライフサイクル状態)
        +String shop_id (担当ショップ)
        +String product_id (選択商品)
        +Number failed_attempts (認証失敗回数)
        +String locked_until (ロック期限)
    }

    class Order_Details["配送先・注文詳細 (Order)"] {
        <<PK: QR#uuid, SK: ORDER>>
        +String name (受取人名)
        +String address (配送先住所)
        +String zipCode (郵便番号)
        +String tracking_number (追跡番号)
    }

    class Chat_History["チャット履歴・設定 (Chat)"] {
        <<PK: QR#uuid, SK: CHAT>>
        +Array messages (メッセージログ)
        +Map email_preferences (通知設定)
        +Object sender_info_snapshot (送信時プロフ)
    }

    QR_Master "1" -- "1" Order_Details : 配送情報を拡張
    QR_Master "1" -- "1" Chat_History : チャットを保持
```

---

## 4. Admin-Centric (システム・マスタ管理視点)

システム管理者が扱う、デザイン定義、物理カードの発注、および一括生成バッチの構造です。

```mermaid
classDiagram
    class Card_Design["カードデザイン定義 (Card Design)"] {
        <<PK: CARD_DESIGN#METADATA, SK: design_id>>
        +String name (デザイン名)
        +String bgimgf (背景画像 URL)
        +Map qrpos (表示位置座標)
    }

    class Card_Order["カード発注管理 (Card Order)"] {
        <<PK: CARD_ORDER#SHOPid, SK: ORDER#order_id>>
        +String order_id (発注ID)
        +Number quantity (発注枚数)
        +String status (状態: ORDERED/PRINTING等)
        +String batch_id (紐付けバッチID)
    }

    class QR_Batch["一括生成バッチ (QR Batch)"] {
        <<PK: QR_BATCH#batch_id, SK: METADATA>>
        +String batch_id (バッチID)
        +Array data [qr_id_pin_pairs]
    }

    Card_Design "1" -- "*" Card_Order : 発注に使用
    Card_Order "1" -- "1" QR_Batch : 限定バッチを生成
    QR_Batch "1" -- "*" QR_Master : 複数のQRを包含
```

---

## 6. Unified Communication (汎用対話・サポート視点)

QRコードに依存しない、システム管理者（Admin）、ショップ（Shop）、一般ユーザー（User）間の対話構造です。

```mermaid
classDiagram
    class Unified_Chat["汎用チャット本体 (Unified Chat)"] {
        <<PK: CHAT#chat_id, SK: META>>
        +String chat_id
        +Array participants [PREFIX#id]
        +String initiator_id
        +String chat_type
        +String status
        +Number last_message_seq
        +String last_message_text
        +String ts_last_message_at
        +Number version
    }

    class Chat_Message["チャット本文 (Message)"] {
        <<PK: CHAT#chat_id, SK: MSG#000000000001>>
        +Number seq
        +String sender_id
        +String sender_user_id
        +String type
        +String payload_type
        +Map payload
        +String workflow_status
        +String ts_created_at
    }

    class Chat_Membership["チャット参加情報 (Membership)"] {
        <<PK: USER#id / SHOP#id / ADMIN, SK: CHAT#chat_id>>
        +String participant_id
        +String ts_last_message_at
        +String last_message_text
        +Number last_read_seq
        +Number unread_count_cache
        +String GSI2_PK (CHAT_INBOX#participant)
        +String GSI2_SK (TS#reverse_epoch#CHAT#chat_id)
    }

    Unified_Chat "1" -- "*" Chat_Membership : 参加者ごとに紐付けレコードを作成
    Unified_Chat "1" -- "*" Chat_Message : 本文はMSGレコードに分離保存
    User_Identity "1" -- "*" Chat_Membership : 個人として参加 (USER#)
    Shop_Metadata "1" -- "*" Chat_Membership : ショップとして参加 (SHOP#)
```
---

## 5. Overall ER Diagram (全体的な実体関連図)

システム全体のエンティティ間の接続性と多重度（カーディナリティ）を俯瞰する全体図です。

```mermaid
erDiagram
    USER ||--o{ SHOP : "所有・管理 (owner_id)"
    USER ||--o{ SENDER : "プロフィール保持"
    USER ||--o{ RECEIVER : "配送先既定値保持"
    USER ||--o{ ACTIVITY_LOG : "行動履歴を記録"
    
    SHOP ||--o{ PRODUCT : "商品をカタログ保持"
    SHOP ||--o{ MANAGED_QR : "発行済みギフトを管理 (GSI2)"
    SHOP ||--o{ CARD_ORDER : "物理カードを発注"
    
    PRODUCT ||--o{ MANAGED_QR : "ギフトに割り当て"
    
    MANAGED_QR ||--|| ORDER_DETAILS : "配送先情報を包含 (PK共通)"
    MANAGED_QR ||--|| CHAT_HISTORY : "対話履歴を保持 (PK共通)"
    
    CARD_DESIGN ||--o{ PRODUCT : "外見を定義"
    CARD_DESIGN ||--o{ SHOP : "利用を許可"
    
    CARD_ORDER ||--|| QR_BATCH : "QRコード群を生成"
    QR_BATCH ||--o{ MANAGED_QR : "生成されたQRを包含"

    USER ||--o{ UNIFIED_CHAT_MEMBERSHIP : "参加 (個人/管理者)"
    SHOP ||--o{ UNIFIED_CHAT_MEMBERSHIP : "参加 (ショップ)"
    UNIFIED_CHAT_MEMBERSHIP }o--|| UNIFIED_CHAT : "所属"
```
