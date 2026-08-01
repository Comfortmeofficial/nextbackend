import { randomInt } from "node:crypto";
import { ApiError } from "@/lib/http-errors";
import { ensureRewardsSchema, getRewardsPool } from "./db";
import type {
  ApplyReferralResponseDto,
  ConvertReferralResponseDto,
  ReferralCodeDto,
  ReferralCodeRow,
  RewardTypeApi,
} from "./types";
import type { ApplyReferralInput, ConvertReferralInput, ReferralCodeCreateInput } from "./validation";

// Excludes visually ambiguous characters (0/O, 1/I/L) — same rationale as
// the legacy service, codes get read off a screen and shared.
const REFERRAL_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const REFERRAL_CODE_LENGTH = 6;
const DEFAULT_REFERRAL_FLAT_AMOUNT = 500.0;

function toApiRewardType(rewardType: ReferralCodeRow["reward_type"]): RewardTypeApi {
  return rewardType.toLowerCase() as RewardTypeApi;
}

function toDbRewardType(rewardType: RewardTypeApi): ReferralCodeRow["reward_type"] {
  return rewardType.toUpperCase() as ReferralCodeRow["reward_type"];
}

function toDto(row: ReferralCodeRow): ReferralCodeDto {
  return {
    id: row.id,
    code: row.code,
    reward_type: toApiRewardType(row.reward_type),
    flat_amount: parseFloat(row.flat_amount),
    percentage: parseFloat(row.percentage),
    max_uses: row.max_uses,
    use_count: row.use_count,
    is_active: row.is_active,
    created_at: row.created_at.toISOString(),
  };
}

function generateReferralCode(): string {
  let suffix = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    suffix += REFERRAL_CODE_CHARS[randomInt(0, REFERRAL_CODE_CHARS.length)];
  }
  return `CM-${suffix}`;
}

async function findActiveByCode(code: string): Promise<ReferralCodeRow | null> {
  const pool = getRewardsPool();
  const { rows } = await pool.query<ReferralCodeRow>(
    `SELECT * FROM referral_codes WHERE code = $1 AND is_active = true`,
    [code],
  );
  return rows[0] ?? null;
}

async function findActiveByOwner(ownerUserId: number): Promise<ReferralCodeRow | null> {
  const pool = getRewardsPool();
  const { rows } = await pool.query<ReferralCodeRow>(
    `SELECT * FROM referral_codes WHERE owner_user_id = $1 AND is_active = true`,
    [ownerUserId],
  );
  return rows[0] ?? null;
}

async function codeExistsAnywhere(code: string): Promise<boolean> {
  const pool = getRewardsPool();
  const { rows } = await pool.query(`SELECT id FROM referral_codes WHERE code = $1`, [code]);
  return rows.length > 0;
}

export async function createReferralCode(input: ReferralCodeCreateInput): Promise<ReferralCodeDto> {
  await ensureRewardsSchema();
  // Mirrors the legacy duplicate check exactly: it only looks at *active*
  // codes, so re-using a code from a deactivated one is allowed here and
  // will fail later at the DB's UNIQUE constraint (a pre-existing quirk in
  // the source service, not something to "fix" during the port).
  const existing = await findActiveByCode(input.code);
  if (existing) {
    throw new ApiError(409, "Referral code already exists");
  }

  const pool = getRewardsPool();
  const { rows } = await pool.query<ReferralCodeRow>(
    `INSERT INTO referral_codes (
       code, reward_type, flat_amount, percentage, max_uses,
       created_by_admin_id, owner_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.code,
      toDbRewardType(input.reward_type),
      input.flat_amount,
      input.percentage,
      input.max_uses ?? null,
      input.created_by_admin_id ?? null,
      input.owner_user_id ?? null,
    ],
  );
  return toDto(rows[0]);
}

export async function listReferralCodes(skip: number, limit: number): Promise<ReferralCodeDto[]> {
  await ensureRewardsSchema();
  const pool = getRewardsPool();
  const { rows } = await pool.query<ReferralCodeRow>(
    `SELECT * FROM referral_codes ORDER BY created_at DESC OFFSET $1 LIMIT $2`,
    [skip, limit],
  );
  return rows.map(toDto);
}

export async function getReferralCode(code: string): Promise<ReferralCodeDto> {
  await ensureRewardsSchema();
  const row = await findActiveByCode(code);
  if (!row) {
    throw new ApiError(404, "Referral code not found or inactive");
  }
  return toDto(row);
}

export async function getOrCreateMyReferralCode(userId: number): Promise<ReferralCodeDto> {
  await ensureRewardsSchema();
  const existing = await findActiveByOwner(userId);
  if (existing) {
    return toDto(existing);
  }

  const pool = getRewardsPool();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    if (await codeExistsAnywhere(code)) {
      continue;
    }
    const { rows } = await pool.query<ReferralCodeRow>(
      `INSERT INTO referral_codes (code, reward_type, flat_amount, percentage, owner_user_id)
       VALUES ($1, 'FLAT', $2, 0, $3)
       RETURNING *`,
      [code, DEFAULT_REFERRAL_FLAT_AMOUNT, userId],
    );
    return toDto(rows[0]);
  }
  throw new ApiError(500, "Could not generate a unique referral code");
}

export async function deactivateReferralCode(codeId: number): Promise<void> {
  await ensureRewardsSchema();
  const pool = getRewardsPool();
  const { rows } = await pool.query(`SELECT id FROM referral_codes WHERE id = $1`, [codeId]);
  if (rows.length === 0) {
    throw new ApiError(404, "Referral code not found");
  }
  await pool.query(
    `UPDATE referral_codes SET is_active = false, updated_at = now() WHERE id = $1`,
    [codeId],
  );
}

export async function applyReferral(input: ApplyReferralInput): Promise<ApplyReferralResponseDto> {
  await ensureRewardsSchema();
  const ref = await findActiveByCode(input.code);
  if (!ref) {
    throw new ApiError(404, "Invalid or inactive referral code");
  }
  if (ref.max_uses !== null && ref.use_count >= ref.max_uses) {
    throw new ApiError(400, "Referral code usage limit reached");
  }

  const pool = getRewardsPool();
  const { rows: usageRows } = await pool.query(
    `SELECT id FROM referral_usages WHERE referral_code_id = $1 AND user_id = $2`,
    [ref.id, input.user_id],
  );
  if (usageRows.length > 0) {
    throw new ApiError(400, "You have already used this referral code");
  }

  let discount = 0;
  const rewardType = ref.reward_type;
  if (rewardType === "FLAT" || rewardType === "BOTH") {
    discount += parseFloat(ref.flat_amount);
  }
  if (rewardType === "PERCENTAGE" || rewardType === "BOTH") {
    discount += input.amount * (parseFloat(ref.percentage) / 100);
  }
  discount = Math.min(discount, input.amount);

  await pool.query(
    `INSERT INTO referral_usages (referral_code_id, user_id, discount_amount, original_amount)
     VALUES ($1, $2, $3, $4)`,
    [ref.id, input.user_id, discount, input.amount],
  );
  await pool.query(
    `UPDATE referral_codes SET use_count = use_count + 1, updated_at = now() WHERE id = $1`,
    [ref.id],
  );

  return {
    code: input.code,
    discount_amount: discount,
    original_amount: input.amount,
    final_amount: input.amount - discount,
  };
}

export async function convertReferral(input: ConvertReferralInput): Promise<ConvertReferralResponseDto> {
  await ensureRewardsSchema();
  const ref = await findActiveByCode(input.code);
  if (!ref || ref.owner_user_id === null || ref.owner_user_id === input.referee_user_id) {
    return { rewarded: false };
  }

  const pool = getRewardsPool();
  const { rows: existingConversion } = await pool.query(
    `SELECT id FROM referral_conversions WHERE referee_user_id = $1`,
    [input.referee_user_id],
  );
  if (existingConversion.length > 0) {
    return { rewarded: false };
  }

  const rewardAmount = parseFloat(ref.flat_amount);
  await pool.query(
    `INSERT INTO referral_conversions (referral_code_id, referee_user_id, trigger, reward_amount)
     VALUES ($1, $2, $3, $4)`,
    [ref.id, input.referee_user_id, input.trigger, rewardAmount],
  );

  return {
    rewarded: true,
    referrer_user_id: ref.owner_user_id,
    reward_amount: rewardAmount,
  };
}
