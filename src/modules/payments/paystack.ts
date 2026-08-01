import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/http-errors";
import type { InitializePaymentResult, VerifyPaymentResult } from "./types";

const BASE_URL = "https://api.paystack.co";

// Mirrors api/v1/payment.py::_gateway() — every endpoint checks this first
// and 500s with the same message if the key is missing, before attempting
// any real call.
function getSecretKey(): string {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    throw new ApiError(500, "Payment gateway not configured");
  }
  return secret;
}

function authHeaders(secret: string): HeadersInit {
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

// Every adapter call in the source wraps failures in a bare `except Exception`
// re-raised as a 400 with str(e) — httpx's raise_for_status() message is
// framework-internal formatting not worth byte-matching; this surfaces
// Paystack's own error message when the response has one, which is more
// actionable anyway.
async function paystackRequest<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  } catch (err) {
    throw new ApiError(400, err instanceof Error ? err.message : String(err));
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message ?? `${response.status} ${response.statusText}`;
    throw new ApiError(400, message);
  }
  return body.data as T;
}

interface PaystackTransactionData {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export async function initializePayment(input: {
  amount: number;
  email: string;
  reference?: string | null;
  callback_url?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<InitializePaymentResult> {
  const secret = getSecretKey();
  const payload: Record<string, unknown> = {
    email: input.email,
    // Paystack amounts are in kobo (smallest currency unit)
    amount: Math.trunc(input.amount * 100),
    reference: input.reference || randomUUID(),
  };
  if (input.callback_url) payload.callback_url = input.callback_url;
  if (input.metadata) payload.metadata = input.metadata;

  const data = await paystackRequest<PaystackTransactionData>(`${BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: authHeaders(secret),
    body: JSON.stringify(payload),
  });
  return {
    authorization_url: data.authorization_url,
    access_code: data.access_code,
    reference: data.reference,
  };
}

interface PaystackVerifyData {
  reference: string;
  amount: number;
  currency?: string;
  status: string;
  paid_at?: string | null;
  channel?: string | null;
  customer?: { email?: string | null };
  authorization?: {
    authorization_code?: string | null;
    last4?: string | null;
    card_type?: string | null;
    bank?: string | null;
    exp_month?: string | null;
    exp_year?: string | null;
  };
  metadata?: Record<string, unknown> | null;
}

function toVerifyResult(data: PaystackVerifyData): VerifyPaymentResult {
  const auth = data.authorization ?? {};
  const customer = data.customer ?? {};
  return {
    reference: data.reference,
    amount: data.amount / 100,
    currency: data.currency ?? "NGN",
    status: data.status,
    paid_at: data.paid_at ?? null,
    channel: data.channel ?? null,
    customer_email: customer.email ?? null,
    authorization_code: auth.authorization_code ?? null,
    last_four: auth.last4 ?? null,
    card_type: auth.card_type ?? null,
    bank: auth.bank ?? null,
    exp_month: auth.exp_month ?? null,
    exp_year: auth.exp_year ?? null,
    metadata: data.metadata ?? null,
  };
}

export async function verifyPayment(reference: string): Promise<VerifyPaymentResult> {
  const secret = getSecretKey();
  const data = await paystackRequest<PaystackVerifyData>(
    `${BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    { method: "GET", headers: authHeaders(secret) },
  );
  return toVerifyResult(data);
}

export async function chargeAuthorization(input: {
  authorization_code: string;
  email: string;
  amount: number;
  reference?: string | null;
}): Promise<VerifyPaymentResult> {
  const secret = getSecretKey();
  const payload = {
    authorization_code: input.authorization_code,
    email: input.email,
    amount: Math.trunc(input.amount * 100),
    reference: input.reference || randomUUID(),
  };
  const data = await paystackRequest<PaystackVerifyData>(`${BASE_URL}/transaction/charge_authorization`, {
    method: "POST",
    headers: authHeaders(secret),
    body: JSON.stringify(payload),
  });
  return toVerifyResult(data);
}

// verify_webhook: HMAC-SHA512 over the raw request body, constant-time
// compared against the x-paystack-signature header.
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = getSecretKey();
  const expected = createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== signatureBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, signatureBuf);
}
