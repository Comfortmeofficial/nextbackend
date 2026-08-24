import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __walletPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __walletSchemaReady: Promise<void> | undefined;
}

export function getWalletPool(): Pool {
  if (!global.__walletPool) {
    const connectionString = process.env.WALLET_DATABASE_URL;
    if (!connectionString) {
      throw new Error("WALLET_DATABASE_URL is not set");
    }
    global.__walletPool = new Pool({ connectionString, max: 3 });
  }
  return global.__walletPool;
}

// Mirrors services/wallet_service/models/wallet.py. type/status are stored
// uppercase (SQLAlchemy's Enum() persists Python enum *names*, not values)
// and lowercased at the API boundary — same pattern used for terms/rewards/
// driver status.
export function ensureWalletSchema(): Promise<void> {
  if (!global.__walletSchemaReady) {
    global.__walletSchemaReady = getWalletPool().query(`
      CREATE TABLE IF NOT EXISTS wallets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE,
        balance NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
        pin_hash VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets (user_id);

      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        wallet_id INTEGER NOT NULL REFERENCES wallets(id),
        type VARCHAR(20) NOT NULL
          CHECK (type IN ('DEPOSIT', 'WITHDRAWAL', 'TRIP_FARE', 'REFUND')),
        amount NUMERIC(12, 2) NOT NULL,
        description VARCHAR(255) NOT NULL,
        reference VARCHAR(100) UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'SUCCESSFUL'
          CHECK (status IN ('PENDING', 'SUCCESSFUL', 'FAILED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions (wallet_id);
    `)
      .then(() => undefined)
      .catch((err) => {
        global.__walletSchemaReady = undefined;
        throw err;
      });
  }
  return global.__walletSchemaReady;
}
