---
title: 新しいギフト体験「名刺代わりに。」とは
---

<section class="manual-container">

# 新しいギフト体験「名刺代わりに。」とは

「名刺代わりに」をご利用いただく際の、カードの購入からギフトの到着までの流れをご説明します。

## 全体の流れ

以下の6つのステップで、簡単にギフトを贈ったり受け取ったりすることができます。

1. カードを購入する
2. メッセージを添えて贈る
3. QRコードをスキャン
4. お届け先情報を入力
5. ギフトが届く
6. 思い出をいつでも見返す

```mermaid
sequenceDiagram
    participant S as ショップ
    actor SD as 贈り主
    actor RC as 受け取り主
    participant system as 名刺代わりに  
    
    SD->>S: 1. カードを店頭で購入
    SD-->>system: プロフィールの登録
    SD->>RC: 2. カードを手渡しでプレゼント
    RC->>system: 3. QRスキャン・ギフト確認
    RC->>system: 4. QRからお届け先を入力
    system-->>S: 発送指示
    S->>RC: 5. ギフトを発送・到着
    RC->>system: 6. 思い出をいつでも見返す
```

---

### 1 カードを購入する
ショップやイベント会場にて、ギフトカードを購入してください。カードには「名刺代わりに」の体験を始めるためのQRコードが印字されています。

![カードの購入](/images/manual/flow_step1_purchase.png)

### 2 メッセージを添えて贈る
贈り主（あなた）のプロフィールやメッセージを登録し、大切な相手にカードをプレゼントします。カードを渡すことで、デジタルとリアルの両方でつながることができます。

![ギフトを贈る](/images/manual/flow_step2_give.png)

### 3 QRコードをスキャン
受け取った方は、スマートフォンのカメラでカードの裏面にあるQRコードを読み取ります。画面には贈り主からのメッセージやギフトの内容が表示されます。

![スキャン操作](/images/manual/flow_step3_scan.png)

### 4 お届け先情報を入力
ギフト内容を確認し、お届け先情報を入力します。

![情報入力](/images/manual/flow_step4_input.png)

### 5 ギフトが届く
ショップにて発送準備が整い次第、入力いただいたご住所へギフトが配送されます。到着を楽しみにお待ちください！

![ギフト到着](/images/manual/flow_step5_receive.png)

### 6 思い出をいつでも見返す
ギフトを受け取って終わりではありません。カードのQRコードは、あなたと贈り主をつなぐ「**デジタル名刺**」として残り続けます。

- **マイページで管理**: [マイページの使い方](/help/user) の履歴から、いつでも過去のやり取りやメッセージを見返すことができます。
- **いつでも連絡**: 贈り主がプロフィールを更新していれば、いつでも最新の連絡先やSNSを確認し、つながりを維持することができます。

</section>

<section class="manual-container mt-20 border rounded-xl p-10">

### まずはアカウントを作りましょう

<div class="flex justify-center my-10">
  <a href="/login" class="group relative inline-flex items-center justify-center px-10 py-4 font-bold text-white transition-all duration-500 bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-600 bg-[length:200%_auto] rounded-full shadow-[0_10px_25px_-5px_rgba(16,185,129,0.4)] hover:shadow-[0_20px_40px_-10px_rgba(16,185,129,0.5)] hover:-translate-y-1.5 hover:scale-105 active:scale-95 overflow-hidden no-underline hover:bg-right">
    <span class="relative z-10 flex items-center gap-3 text-2xl tracking-tight">
      ログイン・新規登録はこちら
      <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 transition-transform duration-500 group-hover:translate-x-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6" />
      </svg>
    </span>
    <div class="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
  </a>
</div>

<section class="notice">
贈り主も受け取り主も、アカウントをお持ちいただくことで履歴の確認や住所入力の利用がスムーズになり、名刺情報（プロフィール）の設定・更新ができるようになります。
</section>

</section>

<section class="manual-container mt-20 border rounded-xl">

<section class="text-center text-4xl p-10">
  「<span class="text-emerald-400 font-bold">名刺代わりに</span>」<br/>が贈る、<br/>新しい<span class="text-amber-400 font-bold">ギフト</span>の形
</section>

<div class="grid-help">
  <section class="benefit">
    <h2>手渡しの「想い」をのせて</h2>
    <p>デジタル全盛の時代だからこそ、物理的なカードを「手渡す」という行為には、言葉以上の重みが宿ります。その瞬間の温度感も一緒にプレゼントしましょう。</p>
  </section>

  <section class="benefit">
    <h2>モノとして残る、唯一の価値</h2>
    <p>受け取ってスキャンした後も、カードはあなたの手元に残ります。ふとした時に目に入るその一枚が、大切な人との思い出を呼び起こすトリガーになります。</p>
  </section>

  <section class="benefit">
    <h2>連絡先も、思い出も、これ一枚で</h2>
    <p>カードは単なるギフトの引き換え券ではありません。最新の連絡先がいつでも確認できる「動く名刺」として、受け取った後の関係性をより豊かに彩ります。</p>
  </section>

  <section class="benefit">
    <h2>終わらない、ギフトのストーリー</h2>
    <p>ギフトが届いた後も、チャットで感謝を伝えたり、過去の旅路を振り返ったり。「名刺代わりに」は、贈った瞬間から始まる新しい物語を支え続けます。</p>
  </section>
</div>

</section>
