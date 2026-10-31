import { getPaymentsPool } from "./db";
import type { PaymentGateway } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __gatewaySettingsSchemaReady: Promise<void> | undefined;
}

// A single admin-controlled toggle deciding which gateway processes new
// card/bank-transfer payments platform-wide — not a customer-facing choice.
// Lives in the payments module (reusing its pool) rather than a new
// standalone settings module, since this is the only setting that exists
// today. The `id = 1` CHECK plus upsert-by-id keeps this a true singleton.
function ensureGatewaySettingsSchema(): Promise<void> {
  if (!global.__gatewaySettingsSchemaReady) {
    global.__gatewaySettingsSchemaReady = getPaymentsPool()
      .query(
        `
      CREATE TABLE IF NOT EXISTS payment_gateway_settings (
        id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        active_gateway VARCHAR(20) NOT NULL DEFAULT 'paystack'
          CHECK (active_gateway IN ('paystack', 'flutterwave')),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by_admin_id INTEGER
      );
    `,
      )
      .then(() => undefined)
      .catch((err) => {
        global.__gatewaySettingsSchemaReady = undefined;
        throw err;
      });
  }
  return global.__gatewaySettingsSchemaReady;
}

// Ships dark: with no row yet (the common case until an admin first visits
// Settings), this defaults to 'paystack' — today's only gateway — so nothing
// changes until someone explicitly flips the toggle.
export async function getActiveGateway(): Promise<PaymentGateway> {
  await ensureGatewaySettingsSchema();
  const { rows } = await getPaymentsPool().query<{ active_gateway: PaymentGateway }>(
    `SELECT active_gateway FROM payment_gateway_settings WHERE id = 1`,
  );
  return rows[0]?.active_gateway ?? "paystack";
}

export async function setActiveGateway(gateway: PaymentGateway, adminId: number): Promise<PaymentGateway> {
  await ensureGatewaySettingsSchema();
  const { rows } = await getPaymentsPool().query<{ active_gateway: PaymentGateway }>(
    `INSERT INTO payment_gateway_settings (id, active_gateway, updated_by_admin_id)
     VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE
       SET active_gateway = $1, updated_by_admin_id = $2, updated_at = now()
     RETURNING active_gateway`,
    [gateway, adminId],
  );
  return rows[0].active_gateway;
}
