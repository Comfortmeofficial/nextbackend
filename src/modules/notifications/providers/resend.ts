const RESEND_API_URL = "https://api.resend.com/emails";

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
