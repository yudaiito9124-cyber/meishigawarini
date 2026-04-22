/**
 * @file email-client.ts
 * @role メール送信エンジン（Resend 連携）
 * @responsibility
 *  - Resend API を使用して、システムからの通知メール（注文確認、登録通知等）を送信します。
 *  - 以前利用していた AWS SES の代替として、モダンで到達率の高いメール配信機能を提供します。
 *  - 送信元アドレス（From）の一貫性を管理します。
 * @context
 *  - 各種 Lambda 関数、特に `infra/lambda/utils/notification.ts` から呼び出され、ユーザーへの直接的なコミュニケーション手段として機能します。
 */

import { Resend } from 'resend';

/** 
 * Resend API キー 
 * 環境変数 `RESEND_API_KEY` から取得します。
 */
const RESEND_API_KEY = process.env.RESEND_API_KEY;

/** 
 * デフォルトの送信元メールアドレス
 * 環境変数 `SENDER_EMAIL` から取得。Resend ダッシュボードで検証済みのドメインである必要があります。
 */
const SENDER_EMAIL = process.env.SENDER_EMAIL;

if (!RESEND_API_KEY) {
    console.warn("Initializing email-client: RESEND_API_KEY is missing. Email sending will fail.");
}

/** Resend クライアントのシングルトンインスタンス */
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

interface SendEmailParams {
    /** 宛先メールアドレス（単一の文字列または配列） */
    to: string | string[];
    /** メール件名 */
    subject: string;
    /** テキスト形式のメール本文 */
    text: string;
    /** HTML 形式のメール本文（オプション） */
    html?: string;
    /** 送信元メールアドレスのオーバーライド（オプション） */
    from?: string;
    /** 返信用メールアドレス（オプション） */
    reply_to?: string;
}

/**
 * Resend API を使用してメールを送信します。
 * 
 * @param params - 送信先、件名、本文等を含むパラメータ。
 * @returns Resend API からのレスポンス（成功時）または例外。
 */
export async function sendEmail({ to, subject, text, html, from, reply_to }: SendEmailParams) {
    if (!RESEND_API_KEY) {
        console.error("Cannot send email: RESEND_API_KEY is not configured.");
        return;
    }

    const fromAddress = from || SENDER_EMAIL;
    if (!fromAddress) {
        console.error("Cannot send email: Sender email address is not configured (SENDER_EMAIL).");
        return;
    }

    // 文字列で渡された宛先を配列に正規化
    const recipients = Array.isArray(to) ? to : [to];

    try {
        console.log(`Sending email via Resend to: ${recipients.join(', ')}`);

        if (!resend) throw new Error("Resend is not initialized");

        const data = await resend.emails.send({
            from: fromAddress,
            to: recipients,
            subject: subject,
            text: text,
            html: html,
            replyTo: reply_to,
        });

        if (data.error) {
            console.error("Resend API returned error:", data.error);
            throw new Error(`Resend Error: ${data.error.message}`);
        }

        console.log("Email sent successfully via Resend:", data.data?.id);
        return data;
    } catch (error) {
        console.error("Failed to send email via Resend:", error);
        // 上位層でリトライやエラーハンドリングを行うため、例外を再スローします。
        throw error;
    }
}
