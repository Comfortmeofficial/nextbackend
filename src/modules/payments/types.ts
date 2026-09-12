export interface InitializePaymentResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface VerifyPaymentResult {
  reference: string;
  amount: number;
  currency: string;
  status: string;
  paid_at: string | null;
  channel: string | null;
  customer_email: string | null;
  authorization_code: string | null;
  last_four: string | null;
  card_type: string | null;
  bank: string | null;
  exp_month: string | null;
  exp_year: string | null;
  metadata: Record<string, unknown> | null;
  // Paystack's own human-readable outcome ("Approved", "Declined",
  // "Insufficient Funds", ...) — the only thing worth surfacing to an admin
  // as a failure reason; there's no more specific machine code to fall back on.
  gateway_response: string | null;
}

// ─── Payments ledger ────────────────────────────────────────────────────────
//
// One row per Paystack-initiated transaction — wallet top-ups, and direct
// card/bank-transfer booking/package/rental payments. Deliberately just
// "what came in via Paystack": excludes paying a booking/package/rental
// *from* an already-funded wallet (purely an internal wallet-ledger entry,
// no new money enters or leaves the system — see wallet/repository.ts), and
// deliberately excludes refunds too, even one for a Paystack-sourced
// payment — a refund only ever credits the wallet, never reverses anything
// through Paystack itself, so it stays wallet-ledger-only rather than
// muddying this table with an outflow. (This table briefly tracked refunds
// too; reverted — see the reasoning in the PR/commit history if it matters.)

export type PaymentPurpose = "wallet_funding" | "booking_payment" | "package_payment" | "rental_payment" | "other";
export type PaymentStatus = "pending" | "successful" | "failed";
export type PaymentMethod = "debit_card" | "bank_transfer";

export interface PaymentRow {
  id: number;
  reference: string;
  user_id: number;
  amount: string; // NUMERIC comes back as a string from node-postgres
  currency: string;
  purpose: string; // uppercase in the DB, see toApiPurpose/toApiStatus
  payment_method: string;
  status: string;
  booking_id: number | null;
  failure_reason: string | null;
  metadata: Record<string, unknown> | null;
  initiated_at: Date;
  completed_at: Date | null;
  updated_at: Date;
}

export interface PaymentDto {
  id: number;
  reference: string;
  user_id: number;
  amount: number;
  currency: string;
  purpose: PaymentPurpose;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  booking_id: number | null;
  failure_reason: string | null;
  metadata: Record<string, unknown> | null;
  initiated_at: string;
  completed_at: string | null;
  updated_at: string;
}
