---
title: 管理者用ヘルプ：運用フロー
---


# 運用フロー

システム管理者が行う主な業務の流れを解説します。ギフト受け渡しを含めた全体的なフローは[ショップの運用フロー](/help/shop/flow)を参照してください。

## 1. カードの発行・供給フロー

ショップからの要望に応じて、またはプロモーション用にカードを発行する際の流れです。
点線はシステム以外で行う作業です。

```mermaid
sequenceDiagram
    participant Sys as システム (DB/S3)    
    actor Admin as システム管理者

    participant Shop as ショップ

    Note over Shop, Admin: [カードの印刷]
    Shop->>Admin: (/shop)「カード発注」タブから枚数を指定して申請

    Note over Admin, Sys: [データの生成]
    Admin->>Sys: (/admin)「カード印刷」タブで申請を承認
    Sys->>Sys: 自動的にQR/PINを発行


    Note over Admin, Sys: [物理カードの作成]
    Admin->>Sys: (/admin) 「カード印刷」タブでPDFまたは画像(ZIP)出力をクリック
    Sys->>Admin: 印刷用ファイル(PDF/PNG)を生成
    Admin-->>Admin: 印刷用ファイル(PDF/PNG)で物理カードを印刷

    Note over Admin, Shop: [物理カードの送付]
    Admin-->>Shop: 物理カードを納品

```

## 2. ショップ・デザインのセットアップ

新しく提携ショップが増えた際や、デザインを更新する際の流れです。

```mermaid
sequenceDiagram
    actor Admin as システム管理者
    participant Sys as システム (DB/S3)
    actor Owner as ショップオーナー (User)

    Note over Admin, Owner: [ショップ開設]
    Owner->>Sys: (/shop) 新規ショップ開設（1店舗目、アクセス時自動作成）
    Admin->>Sys: (/admin) ユーザーIDを指定してショップを作成（各ユーザー２店舗目以降を作成する場合）
    Sys-->>Owner: 管理権限を付与

    Note over Admin, Sys: [デザイン準備]
    Admin->>Sys: (/admin) カードデザインを登録・更新

    Note over Admin, Sys: [認可 (紐付け)]
    Admin->>Sys: (/admin) ショップに使用可能デザインを紐付け
    Owner->>Sys: (/shop) 商品登録・物理カード発注が可能になる
```

- **ショップ開設**: [ショップ管理](/admin)タブから、オーナーとなるユーザーIDを指定してショップを新規作成します。
- **デザイン紐付け**: アカウント作成直後のショップは、使用を許可されたカードデザインが存在しないため、商品の追加やカードの発注ができません。つまりシステム管理者が操作をしない限り商品の販売などを行うことができません。[ショップ管理](/admin)内の「デザイン紐付け設定」でショップごとにデザインを設定することが可能です。このシステム管理者によるデザインの紐付け作業で、実質的にショップの認可を出すことが可能です。
- **デザイン追加**: [デザイン設定](/admin)タブから、新しいカードの背景画像やQRコードの配置レイアウトを登録します。

## 3. 監視・メンテナンス

問い合わせ対応や、不正利用への対応フローです。

```mermaid
sequenceDiagram
    actor User as ユーザー / ショップ
    actor Admin as システム管理者
    participant Sys as システム (DynamoDB)

    Note over User, Admin: [報告・問い合わせ]
    User-->>Admin: 紛失報告・不具合報告
    
    Note over Admin, Sys: [調査・対応]
    Admin->>Sys: (/admin) カード一覧でステータス確認
    alt 不正利用・紛失
        Admin->>Sys: 詳細画面から「BAN処理」を実行
    else 調査が必要
        Admin->>Sys: (/admin) ツール画面で生データを調査
    end
    
    Admin-->>User: 制限または回答を反映
```

- **ステータス確認**: [カード一覧](/admin)から、特定のQRコードが現在「未使用」「有効化済み」「受取済み」等のどの段階にあるかを確認します。
- **BAN処理**: カードの紛失届があった場合や、不正な利用が疑われる場合、「詳細」からステータスを「BANNED」に変更することで、そのカードを無効化します。
- **データメンテナンス**: [ツール](/admin)タブを使用し、DynamoDBの低レイヤーなデータダンプ（PK/SK指定）を行い、詳細な調査や修正を行います。

