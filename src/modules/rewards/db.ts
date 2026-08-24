import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __rewardsPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __rewardsSchemaReady: Promise<void> | undefined;
}

export function getRewardsPool(): Pool {
  if (!global.__rewardsPool) {
    const connectionString = process.env.REWARD_DATABASE_URL;
    if (!connectionString) {
      throw new Error("REWARD_DATABASE_URL is not set");
    }
    global.__rewardsPool = new Pool({ connectionString, max: 3 });
  }
  return global.__rewardsPool;
}

// Mirrors services/reward_service/models/reward.py's three tables.
// reward_type is stored uppercase (SQLAlchemy's Enum(RewardType) persists
// Python enum *names*, not values) and lowercased at the API boundary —
// same pattern as terms_and_conditions' status column.
export function ensureRewardsSchema(): Promise<void> {
  if (!global.__rewardsSchemaReady) {
    global.__rewardsSchemaReady = getRewardsPool().query(`
      CREATE TABLE IF NOT EXISTS referral_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        created_by_admin_id INTEGER,
        owner_user_id INTEGER,
        reward_type VARCHAR(20) NOT NULL DEFAULT 'FLAT'
          CHECK (reward_type IN ('FLAT', 'PERCENTAGE', 'BOTH')),
        flat_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
        percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
        max_uses INTEGER,
        use_count INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_referral_codes_owner ON referral_codes (owner_user_id);

      CREATE TABLE IF NOT EXISTS referral_usages (
        id SERIAL PRIMARY KEY,
        referral_code_id INTEGER NOT NULL REFERENCES referral_codes(id),
        user_id INTEGER NOT NULL,
        discount_amount NUMERIC(12, 2) NOT NULL,
        original_amount NUMERIC(12, 2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_referral_usages_user ON referral_usages (user_id);

      CREATE TABLE IF NOT EXISTS referral_conversions (
        id SERIAL PRIMARY KEY,
        referral_code_id INTEGER NOT NULL REFERENCES referral_codes(id),
        referee_user_id INTEGER NOT NULL UNIQUE,
        trigger VARCHAR(20) NOT NULL,
        reward_amount NUMERIC(12, 2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Admin-configured reward ladder: "refer N people, earn this reward."
      -- Global — applies the same way to every user's own referral code.
      CREATE TABLE IF NOT EXISTS referral_milestones (
        id SERIAL PRIMARY KEY,
        threshold INTEGER NOT NULL UNIQUE,
        reward_type VARCHAR(20) NOT NULL DEFAULT 'PERCENTAGE'
          CHECK (reward_type IN ('FLAT', 'PERCENTAGE')),
        reward_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
        label VARCHAR(255) NOT NULL DEFAULT '',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS referral_milestone_claims (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        milestone_id INTEGER NOT NULL REFERENCES referral_milestones(id),
        referral_code_id INTEGER NOT NULL REFERENCES referral_codes(id),
        claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, milestone_id)
      );
      CREATE INDEX IF NOT EXISTS idx_referral_milestone_claims_user ON referral_milestone_claims (user_id);
    `)
      .then(() => undefined)
      .catch((err) => {
        global.__rewardsSchemaReady = undefined;
        throw err;
      });
  }
  return global.__rewardsSchemaReady;
}
