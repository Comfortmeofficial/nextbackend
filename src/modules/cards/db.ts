import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __cardsPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __cardsSchemaReady: Promise<void> | undefined;
}

export function getCardsPool(): Pool {
  if (!global.__cardsPool) {
    const connectionString = process.env.CARD_DATABASE_URL;
    if (!connectionString) {
      throw new Error("CARD_DATABASE_URL is not set");
    }
    global.__cardsPool = new Pool({ connectionString });
  }
  return global.__cardsPool;
}

// Mirrors services/card_service/models/card.py — only tokenized metadata is
// stored (last_four, paystack_auth_code), never a raw PAN.
export function ensureCardsSchema(): Promise<void> {
  if (!global.__cardsSchemaReady) {
    global.__cardsSchemaReady = getCardsPool().query(`
      CREATE TABLE IF NOT EXISTS cards (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        card_holder_name VARCHAR(100) NOT NULL,
        last_four VARCHAR(4) NOT NULL,
        card_type VARCHAR(20) NOT NULL DEFAULT 'visa',
        expiry_month VARCHAR(2) NOT NULL,
        expiry_year VARCHAR(4) NOT NULL,
        bank_name VARCHAR(100),
        paystack_auth_code VARCHAR(255),
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards (user_id);
    `).then(() => undefined);
  }
  return global.__cardsSchemaReady;
}
