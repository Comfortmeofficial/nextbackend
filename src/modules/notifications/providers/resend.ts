const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_BATCH_API_URL = "https://api.resend.com/emails/batch";
// Resend's own hard cap on a single batch request.
export const RESEND_BATCH_LIMIT = 100;

// A CID-referenced inline image — `content` is the base64-encoded file
// bytes, `content_id` is whatever the HTML's <img src="cid:..."> uses.
// Gmail (and several other major clients) strip data:-URI <img> tags
// outright, so this is the only reliable way to embed an image (a QR code,
// say) directly in the email body rather than linking out to a hosted URL.
export interface EmailAttachment {
  filename: string;
  content: string;
  content_id: string;
  content_type?: string;
}

// Direct port of providers/resend_provider.py — the source already calls
// Resend's raw HTTP API itself (no SDK), so this is a 1:1 translation.
export async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string,
  attachments?: EmailAttachment[],
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY || "";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@comfortmeng.com";
  const fromName = process.env.RESEND_FROM_NAME || "Comfortme";

  if (!apiKey) {
    console.info(`Email (resend unavailable): to=${to} subject=${subject}`);
    return false;
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject,
        html: htmlBody,
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error(`Resend email error: ${response.status} ${await response.text()}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Resend email error:", error);
    return false;
  }
}

export interface BatchEmailItem {
  to: string;
  subject: string;
  html: string;
}

// Resend's batch endpoint — one HTTP call sends up to RESEND_BATCH_LIMIT
// independently-addressed emails (each with its own `to`/subject/html),
// instead of one round trip per recipient. Callers are responsible for
// chunking `items` to that limit; this just sends whatever's given it and
// reports whether the call itself succeeded (Resend's batch response
// doesn't give a per-recipient breakdown the way a single send's 200
// confirms that one address).
export async function sendBatchEmails(items: BatchEmailItem[]): Promise<boolean> {
  if (items.length === 0) return true;
  const apiKey = process.env.RESEND_API_KEY || "";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@comfortmeng.com";
  const fromName = process.env.RESEND_FROM_NAME || "Comfortme";

  if (!apiKey) {
    console.info(`Batch email (resend unavailable): ${items.length} recipients`);
    return false;
  }

  try {
    const response = await fetch(RESEND_BATCH_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        items.map((item) => ({
          from: `${fromName} <${fromEmail}>`,
          to: [item.to],
          subject: item.subject,
          html: item.html,
        })),
      ),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      console.error(`Resend batch email error: ${response.status} ${await response.text()}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Resend batch email error:", error);
    return false;
  }
}
