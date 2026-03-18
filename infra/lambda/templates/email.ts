import { sendEmail } from '../utils/email-client';
import jaSubjects from './locales/ja.json';
import enSubjects from './locales/en.json';

// Import bodies
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

export type EmailType =
    | 'MESSAGE_NOTIFICATION'
    | 'SYSTEM_NOTIFICATION'
    | 'SHIPPING_NOTIFICATION'
    | 'ADDRESS_REGISTRATION_CONFIRMATION'
    | 'ADDRESS_REGISTRATION_NOTIFICATION';

const subjects: Record<string, any> = {
    ja: jaSubjects,
    en: enSubjects
};

const bodies: Record<string, Record<string, string>> = {
    ja: {
        MESSAGE_NOTIFICATION: jaMessageNotification.body,
        SYSTEM_NOTIFICATION: jaSystemNotification.body,
        SHIPPING_NOTIFICATION: jaShippingNotification.body,
        ADDRESS_REGISTRATION_CONFIRMATION: jaAddressConfirmation.body,
        ADDRESS_REGISTRATION_NOTIFICATION: jaAddressNotification.body
    },
    en: {
        MESSAGE_NOTIFICATION: enMessageNotification.body,
        SYSTEM_NOTIFICATION: enSystemNotification.body,
        SHIPPING_NOTIFICATION: enShippingNotification.body,
        ADDRESS_REGISTRATION_CONFIRMATION: enAddressConfirmation.body,
        ADDRESS_REGISTRATION_NOTIFICATION: enAddressNotification.body
    }
};

/**
 * Replaces placeholders like {{variable}} with actual values.
 */
function replacePlaceholders(template: string, params: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return params[key] !== undefined ? params[key] : match;
    });
}

interface SendLocalizedEmailParams {
    type: EmailType;
    to: string | string[];
    params: Record<string, string>;
    lang?: 'ja' | 'en';
}

/**
 * Unified function to send localized emails based on type and params.
 */
export async function sendLocalizedEmail(options: SendLocalizedEmailParams) {
    const { type, to, params, lang = 'ja' } = options;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://meishigawarini.com';

    const subjectTemplate = subjects[lang][type];
    const bodyTemplate = bodies[lang][type];

    if (!subjectTemplate || !bodyTemplate) {
        throw new Error(`Email template not found for type: ${type} and lang: ${lang}`);
    }

    const allParams = { ...params, baseUrl };
    const subject = replacePlaceholders(subjectTemplate, allParams);
    const bodyText = replacePlaceholders(bodyTemplate, allParams);

    return await sendEmail({
        to,
        subject,
        text: bodyText
    });
}

// Deprecated: Old functions for backward compatibility (optional, but good to keep during migration)
export const createMessageNotificationEmail = (params: any) => {
    // This is now handled by sendLocalizedEmail
    console.warn("createMessageNotificationEmail is deprecated. Use sendLocalizedEmail instead.");
    return { subject: "", bodyText: "" };
};
