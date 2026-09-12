import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __paymentsPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __paymentsSchemaReady: Promise<void> | undefined;
}

export function getPaymentsPool(): Pool {
  if (!global.__paymentsPool) {
    const connectionString = process.env.PAYMENTS_DATABASE_URL;
    if (!connectionString) {
      throw new Error("PAYMENTS_DATABASE_URL is not set");
    }
    global.__paymentsPool = new Pool({ connectionString, max: 3 });
  }
  return global.__paymentsPool;
}

// New table, not migrated from a legacy service — there is no prior payments
// ledger to mirror. booking_id is a plain column with no DB-level FK:
// bookings live in a different domain's database (same cross-domain
// convention as buses.driver_id), so referential integrity there is
// application-level only.
export function ensurePaymentsSchema(): Promise<void> {
  if (!global.__paymentsSchemaReady) {
    global.__paymentsSchemaReady = getPaymentsPool()
      .query(
        `
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        reference VARCHAR(255) NOT NULL UNIQUE,
        user_id INTEGER NOT NULL,
        amount DOUBLE PRECISION NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
        purpose VARCHAR(20) NOT NULL
          CHECK (purpose IN ('WALLET_FUNDING', 'BOOKING_PAYMENT', 'PACKAGE_PAYMENT', 'RENTAL_PAYMENT', 'OTHER')),
        payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('DEBIT_CARD', 'BANK_TRANSFER')),
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESSFUL', 'FAILED')),
        booking_id INTEGER,
        failure_reason TEXT,
        metadata JSONB,
        initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments (user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
      CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments (booking_id);
      CREATE INDEX IF NOT EXISTS idx_payments_initiated_at ON payments (initiated_at);
    `,
      )
      .then(() => undefined)
      .catch((err) => {
        global.__paymentsSchemaReady = undefined;
        throw err;
      });
  }
  return global.__paymentsSchemaReady;
}
