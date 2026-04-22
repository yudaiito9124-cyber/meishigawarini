/**
 * @file email.ts
 * @role 多言語対応メールテンプレートマネージャー
 * @responsibility
 *  - 日本語（ja）および英語（en）のメールテンプレート（件名・本文）を統合管理します。
 *  - テンプレート内のプレースホルダー（`{{variable}}`）を実データに置換する共通ロジックを提供します。
 *  - 指定された言語と通知タイプに基づき、最終的なメールコンテンツを構築して送信依頼を行います。
 * @context
 *  - `infra/lambda/utils/notification.ts` 等から呼び出され、ユーザーへの最終的な通知文面を決定します。
 *  - 文面自体は `locales/` 配下の各ディレクトリでタイプ別に分割定義されています。
 */

import { sendEmail } from '../utils/email-client';
import jaSubjects from './locales/ja.json';
import enSubjects from './locales/en.json';

// 各種通知タイプの本文テンプレートをインポート
import * as jaMessageNotification from './locales/ja/MESSAGE_NOTIFICATION';
import * as enMessageNotification from './locales/en/MESSAGE_NOTIFICATION';
import * as jaSystemNotification from './locales/ja/SYSTEM_NOTIFICATION';
import * as enSystemNotification from './locales/en/SYSTEM_NOTIFICATION';
import * as jaShippingNotification from './locales/ja/SHIPPING_NOTIFICATION';
import * as enShippingNotification from './locales/en/SHIPPING_NOTIFICATION';
import * as jaAddressConfirmation from './locales/ja/ADDRESS_REGISTRATION_CONFIRMATION';
import * as enAddressConfirmation from './locales/en/ADDRESS_REGISTRATION_CONFIRMATION';
import * as jaAddressNotification from './locales/ja/ADDRESS_REGISTRATION_NOTIFICATION';
import * as enAddressNotification from './locales/en/ADDRESS_REGISTRATION_NOTIFICATION';
import * as jaInquiryNotification from './locales/ja/INQUIRY_NOTIFICATION';
import * as enInquiryNotification from './locales/en/INQUIRY_NOTIFICATION';

/** システムで利用可能な通知メールのタイプ */
export type EmailType =
    | 'MESSAGE_NOTIFICATION'
    | 'SYSTEM_NOTIFICATION'
    | 'SHIPPING_NOTIFICATION'
    | 'ADDRESS_REGISTRATION_CONFIRMATION'
    | 'ADDRESS_REGISTRATION_NOTIFICATION'
    | 'INQUIRY_NOTIFICATION';

/** 言語別の件名マッピング */
const subjects: Record<string, any> = {
    ja: jaSubjects,
    en: enSubjects
};

/** 言語別の本文テンプレートマッピング */
const bodies: Record<string, Record<string, string>> = {
    ja: {
        MESSAGE_NOTIFICATION: jaMessageNotification.body,
        SYSTEM_NOTIFICATION: jaSystemNotification.body,
        SHIPPING_NOTIFICATION: jaShippingNotification.body,
        ADDRESS_REGISTRATION_CONFIRMATION: jaAddressConfirmation.body,
        ADDRESS_REGISTRATION_NOTIFICATION: jaAddressNotification.body,
        INQUIRY_NOTIFICATION: jaInquiryNotification.body
    },
    en: {
        MESSAGE_NOTIFICATION: enMessageNotification.body,
        SYSTEM_NOTIFICATION: enSystemNotification.body,
        SHIPPING_NOTIFICATION: enShippingNotification.body,
        ADDRESS_REGISTRATION_CONFIRMATION: enAddressConfirmation.body,
        ADDRESS_REGISTRATION_NOTIFICATION: enAddressNotification.body,
        INQUIRY_NOTIFICATION: enInquiryNotification.body
    }
};

/**
 * テンプレート文字列内の `{{variable}}` 形式のプレースホルダーをパラメータ値で置換します。
 * 
 * @param template - 置換対象の文字列。
 * @param params - 置換に使用するキーバリューペア。
 * @returns 置換後の文字列。
 */
function replacePlaceholders(template: string, params: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return params[key] !== undefined ? params[key] : match;
    });
}

interface SendLocalizedEmailParams {
    /** 送信メールのタイプ */
    type: EmailType;
    /** 宛先アドレス */
    to: string | string[];
    /** テンプレート内プレースホルダーの置換用パラメータ */
    params: Record<string, string>;
    /** 言語設定 (デフォルト 'ja') */
    lang?: 'ja' | 'en';
    /** 返信用メールアドレス（オプション） */
    reply_to?: string;
}

/**
 * 言語設定に基づいたローカライズ済みメールを送信します。
 * 
 * @param options - 送信先、タイプ、言語、各種パラメータ。
 */
export async function sendLocalizedEmail(options: SendLocalizedEmailParams) {
    const { type, to, params, lang = 'ja', reply_to } = options;
    // リンク生成に使用するベース URL (環境変数から取得)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://meishigawarini.com';

    const subjectTemplate = subjects[lang][type];
    const bodyTemplate = bodies[lang][type];

    if (!subjectTemplate || !bodyTemplate) {
        throw new Error(`Email template not found for type: ${type} and lang: ${lang}`);
    }

    // デフォルトの baseUrl を含めて全パラメータをマージ
    const allParams = { ...params, baseUrl };
    const subject = replacePlaceholders(subjectTemplate, allParams);
    const bodyText = replacePlaceholders(bodyTemplate, allParams);

    // email-client を用いて送信を実行
    return await sendEmail({
        to,
        subject,
        text: bodyText,
        reply_to
    });
}