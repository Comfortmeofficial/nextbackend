import { ensurePaymentsSchema, getPaymentsPool } from "./db";
import type { PaymentDto, PaymentMethod, PaymentPurpose, PaymentRow } from "./types";

function toDto(row: PaymentRow): PaymentDto {
  return {
    id: row.id,
    reference: row.reference,
    user_id: row.user_id,
    amount: row.amount === null ? 0 : parseFloat(row.amount),
    currency: row.currency,
    purpose: row.purpose.toLowerCase() as PaymentDto["purpose"],
    payment_method: row.payment_method.toLowerCase() as PaymentDto["payment_method"],
    status: row.status.toLowerCase() as PaymentDto["status"],
    booking_id: row.booking_id,
    failure_reason: row.failure_reason,
    metadata: row.metadata,
    initiated_at: row.initiated_at.toISOString(),
    completed_at: row.completed_at ? row.completed_at.toISOString() : null,
    updated_at: row.updated_at.toISOString(),
  };
}

// Called at the point a Paystack call is actually made (chargeAuthorization
// or initializePayment) — before we know the outcome, which is the whole
// point: a payment exists in the ledger from the moment it's attempted, not
// only once it happens to succeed.
export async function createPayment(input: {
  reference: string;
  user_id: number;
  amount: number;
  purpose: PaymentPurpose;
  payment_method: PaymentMethod;
  booking_id?: number | null;
  metadata?: Record<string, unknown> | null;
}): Promise<PaymentDto> {
  await ensurePaymentsSchema();
  const pool = getPaymentsPool();
  const { rows } = await pool.query<PaymentRow>(
    `INSERT INTO payments (reference, user_id, amount, purpose, payment_method, booking_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.reference,
      input.user_id,
      input.amount,
      input.purpose.toUpperCase(),
      input.payment_method.toUpperCase(),
      input.booking_id ?? null,
      input.metadata ?? null,
    ],
  );
  return toDto(rows[0]);
}

export async function getPaymentByReference(reference: string): Promise<PaymentDto | null> {
  await ensurePaymentsSchema();
  const pool = getPaymentsPool();
  const { rows } = await pool.query<PaymentRow>(`SELECT * FROM payments WHERE reference = $1`, [reference]);
  return rows[0] ? toDto(rows[0]) : null;
}

// Both mark* functions only transition a payment out of PENDING — the
// WHERE clause makes a second call for the same reference (the client's own
// verify call racing the webhook, or a webhook Paystack retries) a safe
// no-op instead of clobbering an already-resolved row or double-crediting
// whatever the caller does alongside this.
export async function markPaymentSuccessful(
  reference: string,
  opts: { booking_id?: number | null } = {},
): Promise<PaymentDto | null> {
  await ensurePaymentsSchema();
  const pool = getPaymentsPool();
  const { rows } = await pool.query<PaymentRow>(
    `UPDATE payments
     SET status = 'SUCCESSFUL', completed_at = now(), updated_at = now(),
         booking_id = COALESCE($2, booking_id)
     WHERE reference = $1 AND status = 'PENDING'
     RETURNING *`,
    [reference, opts.booking_id ?? null],
  );
  return rows[0] ? toDto(rows[0]) : null;
}

export async function markPaymentFailed(reference: string, failureReason: string | null): Promise<PaymentDto | null> {
  await ensurePaymentsSchema();
  const pool = getPaymentsPool();
  const { rows } = await pool.query<PaymentRow>(
    `UPDATE payments
     SET status = 'FAILED', completed_at = now(), updated_at = now(), failure_reason = $2
     WHERE reference = $1 AND status = 'PENDING'
     RETURNING *`,
    [reference, failureReason],
  );
  return rows[0] ? toDto(rows[0]) : null;
}

// For the sequence where Paystack confirms the charge before the booking
// exists (seats are reserved *after* a successful charge, so the payment is
// already SUCCESSFUL — correctly reflecting that Paystack was paid — by the
// time a booking id is available to attach). No status guard here: this
// only ever adds information to an already-resolved row, it never changes
// pending/successful/failed.
export async function attachPaymentBooking(reference: string, bookingId: number): Promise<void> {
  await ensurePaymentsSchema();
  const pool = getPaymentsPool();
  await pool.query(`UPDATE payments SET booking_id = $2, updated_at = now() WHERE reference = $1`, [
    reference,
    bookingId,
  ]);
}

export async function listPayments(skip: number, limit: number): Promise<PaymentDto[]> {
  await ensurePaymentsSchema();
  const pool = getPaymentsPool();
  const { rows } = await pool.query<PaymentRow>(
    `SELECT * FROM payments ORDER BY initiated_at DESC OFFSET $1 LIMIT $2`,
    [skip, limit],
  );
  return rows.map(toDto);
}
