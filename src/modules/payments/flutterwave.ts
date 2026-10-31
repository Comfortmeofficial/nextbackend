import { randomUUID, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/http-errors";
import type { InitializePaymentResult, VerifyPaymentResult } from "./types";

const BASE_URL = "https://api.flutterwave.com/v3";

function getSecretKey(): string {
  const secret = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!secret) {
    throw new ApiError(500, "Payment gateway not configured");
  }
  return secret;
}

function getSecretHash(): string {
  const hash = process.env.FLUTTERWAVE_SECRET_HASH;
  if (!hash) {
    throw new ApiError(500, "Payment gateway not configured");
  }
  return hash;
}

function authHeaders(secret: string): HeadersInit {
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

async function flutterwaveRequest<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  } catch (err) {
    throw new ApiError(400, err instanceof Error ? err.message : String(err));
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.status === "error") {
    const message = body?.message ?? `${response.status} ${response.statusText}`;
    throw new ApiError(400, message);
  }
  return body.data as T;
}

interface FlutterwaveInitData {
  link: string;
}

// Flutterwave's `meta` field only documents flat string sub-properties
// (meta_1/meta_2 in its own API reference) — unlike Paystack's `metadata`,
// which accepts arbitrary nested JSON faithfully. Sending a payBooking-style
// metadata object straight through (it carries a `legs` array of objects)
// produces "Invalid meta data passed" on Flutterwave's hosted checkout page.
// Flattening every non-string value to its JSON-encoded string here —
// transparent to every caller in paymentHub/service.ts, which keeps passing
// and reading rich objects — fixes this without touching the Paystack path
// or any shared code at all.
function encodeMeta(metadata: Record<string, unknown>): Record<string, string> {
  const encoded: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) continue;
    encoded[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return encoded;
}

// Mirrors encodeMeta: every value Flutterwave echoes back is a string, so
// anything that round-trips through JSON.parse was something encodeMeta
// JSON.stringify'd (a number, array, object, boolean); anything that fails
// to parse was left as a plain string on the way in — note this means a
// purely numeric-looking plain string (e.g. a numeric coupon code) would
// be misread as a number, an accepted edge case for now.
function decodeMeta(meta: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!meta) return null;
  const decoded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (typeof value !== "string") {
      decoded[key] = value;
      continue;
    }
    try {
      decoded[key] = JSON.parse(value);
    } catch {
      decoded[key] = value;
    }
  }
  return decoded;
}

// Unlike Paystack, Flutterwave's Standard checkout amounts are in the
// currency's major unit — no *100 kobo-style conversion.
export async function initializePayment(input: {
  amount: number;
  email: string;
  name?: string | null;
  phone?: string | null;
  reference?: string | null;
  callback_url?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<InitializePaymentResult> {
  const secret = getSecretKey();
  const reference = input.reference || randomUUID();
  const payload: Record<string, unknown> = {
    tx_ref: reference,
    amount: String(input.amount),
    currency: "NGN",
    customer: {
      email: input.email,
      ...(input.name ? { name: input.name } : {}),
      ...(input.phone ? { phonenumber: input.phone } : {}),
    },
    customizations: { title: "ComfortMe" },
  };
  if (input.callback_url) payload.redirect_url = input.callback_url;
  if (input.metadata) payload.meta = encodeMeta(input.metadata);

  const data = await flutterwaveRequest<FlutterwaveInitData>(`${BASE_URL}/payments`, {
    method: "POST",
    headers: authHeaders(secret),
    body: JSON.stringify(payload),
  });
  return {
    authorization_url: data.link,
    access_code: "",
    reference,
  };
}

// Shape of Flutterwave's transaction resource, shared by verify_by_reference,
// the by-id verify endpoint, and a webhook event's `data` object.
export interface FlutterwaveVerifyData {
  tx_ref: string;
  amount: number;
  currency?: string;
  status: string;
  created_at?: string | null;
  payment_type?: string | null;
  processor_response?: string | null;
  customer?: { email?: string | null };
  card?: {
    token?: string | null;
    last_4digits?: string | null;
    type?: string | null;
    expiry?: string | null;
  };
  meta?: Record<string, unknown> | null;
}

// Normalizes Flutterwave's "successful"/"failed" vocabulary to Paystack's
// "success" so processPaymentResult's `result.status === "success"` check
// works unchanged for either gateway.
export function toVerifyResult(data: FlutterwaveVerifyData): VerifyPaymentResult {
  const card = data.card ?? {};
  const customer = data.customer ?? {};
  const [expMonth, expYear] = (card.expiry ?? "").split("/");
  return {
    reference: data.tx_ref,
    amount: data.amount,
    currency: data.currency ?? "NGN",
    status: data.status === "successful" ? "success" : data.status,
    paid_at: data.created_at ?? null,
    channel: data.payment_type ?? null,
    customer_email: customer.email ?? null,
    authorization_code: card.token ?? null,
    last_four: card.last_4digits ?? null,
    card_type: card.type ?? null,
    bank: null,
    exp_month: expMonth || null,
    exp_year: expYear || null,
    metadata: decodeMeta(data.meta),
    gateway_response: data.processor_response ?? null,
  };
}

export async function verifyPaymentByReference(reference: string): Promise<VerifyPaymentResult> {
  const secret = getSecretKey();
  const data = await flutterwaveRequest<FlutterwaveVerifyData>(
    `${BASE_URL}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
    { method: "GET", headers: authHeaders(secret) },
  );
  return toVerifyResult(data);
}

// Flutterwave's analogue of Paystack's chargeAuthorization — charges a
// previously-tokenized card (data.card.token from an earlier verify) with
// no redirect.
export async function chargeToken(input: {
  token: string;
  email: string;
  amount: number;
  reference?: string | null;
}): Promise<VerifyPaymentResult> {
  const secret = getSecretKey();
  const reference = input.reference || randomUUID();
  const payload = {
    token: input.token,
    currency: "NGN",
    amount: String(input.amount),
    email: input.email,
    tx_ref: reference,
  };
  const data = await flutterwaveRequest<FlutterwaveVerifyData>(`${BASE_URL}/tokenized-charges`, {
    method: "POST",
    headers: authHeaders(secret),
    body: JSON.stringify(payload),
  });
  return toVerifyResult(data);
}

// Flutterwave's webhook check is a plain constant-time string compare of
// the `verif-hash` header against a secret hash configured in the
// dashboard's Settings -> Webhooks page — not an HMAC like Paystack's.
export function verifyWebhookSignature(signature: string): boolean {
  if (!signature) return false;
  const secret = getSecretHash();
  const secretBuf = Buffer.from(secret, "utf8");
  const signatureBuf = Buffer.from(signature, "utf8");
  if (secretBuf.length !== signatureBuf.length) {
    return false;
  }
  return timingSafeEqual(secretBuf, signatureBuf);
}
