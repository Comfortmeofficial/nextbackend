// The source wraps the official twilio SDK and treats it as "available"
// purely based on whether the package imported successfully — not whether
// credentials are actually present, so it attempts (and fails) a real send
// with empty creds. Calling Twilio's REST API directly here and gating on
// non-empty config first is externally equivalent (an empty-credential send
// always fails and returns false either way) without needing the SDK.
export async function sendSms(to: string, message: string): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const fromNumber = process.env.TWILIO_FROM_NUMBER || "";

  if (!accountSid || !authToken || !fromNumber) {
    console.info(`SMS (twilio unavailable): to=${to} msg=${message}`);
    return false;
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ Body: message, From: fromNumber, To: to }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) {
      console.error(`Twilio SMS error: ${response.status} ${await response.text()}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Twilio SMS error:", error);
    return false;
  }
}
