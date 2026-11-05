import { listMassEmailRecipients } from "@/modules/users/repository";
import { EMAIL_LOGO_HTML } from "./service";
import { RESEND_BATCH_LIMIT, sendBatchEmails } from "./providers/resend";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Admins write plain text (a textarea, not a rich editor) — blank-line-
// separated paragraphs, single newlines within one kept as line breaks.
// Escaped first so nothing an admin types can inject markup into an email
// that's about to go to every user.
function bodyToHtml(body: string): string {
  return body
    .trim()
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 16px;">${escapeHtml(para).split("\n").join("<br/>")}</p>`)
    .join("");
}

// Same card/logo/heading-color look every other Comfortme transactional
// email already uses (see sendOtpNotification, sendWaitlistNotification) —
// "themed to the app" by construction, not a new design an admin could get
// wrong, since they only ever supply the subject and body text.
export function buildMassEmailHtml(firstName: string, subject: string, body: string): string {
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
    ${EMAIL_LOGO_HTML}
    <h1 style="color:#0058BC;font-size:24px;margin:0 0 16px;">${escapeHtml(subject)}</h1>
    <p style="color:#374151;font-size:16px;margin:0 0 16px;">Hi ${escapeHtml(firstName) || "there"},</p>
    <div style="color:#374151;font-size:16px;line-height:1.6;">${bodyToHtml(body)}</div>
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e5e7eb;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">
        You're receiving this because you have a Comfortme account.
      </p>
    </div>
  </div>
  `;
}

// Fans a subject/body out to every active user, personalized per recipient
// (first name) but otherwise identical, via Resend's batch endpoint —
// RESEND_BATCH_LIMIT recipients per HTTP call instead of one call each.
// Sequential, not parallel: a broadcast to thousands of people is already
// the kind of thing worth not bursting against Resend's own rate limits
// for. Returns the recipient count immediately; the actual sending is
// expected to run inside request.after() so the admin's request doesn't
// hang for however long a few dozen batches take.
export async function sendMassEmail(subject: string, body: string): Promise<number> {
  const recipients = await listMassEmailRecipients();
  for (let i = 0; i < recipients.length; i += RESEND_BATCH_LIMIT) {
    const chunk = recipients.slice(i, i + RESEND_BATCH_LIMIT);
    const items = chunk.map((r) => ({
      to: r.email,
      subject,
      html: buildMassEmailHtml(r.first_name, subject, body),
    }));
    await sendBatchEmails(items).catch(() => {});
  }
  return recipients.length;
}
