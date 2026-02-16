import { Resend } from 'resend';

// Initialize Resend with API Key from environment variables
const RESEND_API_KEY = process.env.RESEND_API_KEY;
// The sender email address (From: header)
// This must be verified in Resend Dashboard or belong to a verified domain.
const SENDER_EMAIL = process.env.SENDER_EMAIL || process.env.SENDER_EMAIL;

if (!RESEND_API_KEY) {
    console.warn("Initializing email-client: RESEND_API_KEY is missing. Email sending will fail.");
}

const resend = new Resend(RESEND_API_KEY);

interface SendEmailParams {
    to: string | string[];
    subject: string;
    text: string;
    html?: string;
    from?: string; // Optional override
}

/**
 * Sends an email using Resend.
 * Replaces AWS SES functionality.
 */
export async function sendEmail({ to, subject, text, html, from }: SendEmailParams) {
    if (!RESEND_API_KEY) {
        console.error("Cannot send email: RESEND_API_KEY is not configured.");
        return;
    }

    const fromAddress = from || SENDER_EMAIL;
    if (!fromAddress) {
        console.error("Cannot send email: Sender email address is not configured (SENDER_EMAIL or SENDER_EMAIL).");
        return;
    }

    // Convert 'to' to array if string
    const recipients = Array.isArray(to) ? to : [to];

    try {
        console.log(`Sending email via Resend to: ${recipients.join(', ')}`);

        const data = await resend.emails.send({
            from: fromAddress,
            to: recipients,
            subject: subject,
            text: text,
            html: html,
        });

        if (data.error) {
            console.error("Resend API returned error:", data.error);
            throw new Error(`Resend Error: ${data.error.message}`);
        }

        console.log("Email sent successfully via Resend:", data.data?.id);
        return data;
    } catch (error) {
        console.error("Failed to send email via Resend:", error);
        // We might want to throw or return error depending on caller expectation.
        // For now, let's log and rethrow to allow caller to handle (e.g. not failing lambda if email fails)
        throw error;
    }
}
