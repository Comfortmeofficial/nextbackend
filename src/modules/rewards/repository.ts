import { randomInt } from "node:crypto";
import { ApiError } from "@/lib/http-errors";
import { ensureRewardsSchema, getRewardsPool } from "./db";
import type {
  ApplyReferralResponseDto,
  ClaimMilestoneResponseDto,
  ConvertReferralResponseDto,
  MilestoneRewardTypeApi,
  ReferralCodeDto,
  ReferralCodeRow,
  ReferralMilestoneDto,
  ReferralMilestoneRow,
  ReferralProgressDto,
  RewardTypeApi,
} from "./types";
import type {
  ApplyReferralInput,
  ClaimMilestoneInput,
  ConvertReferralInput,
  ReferralCodeCreateInput,
  ReferralMilestoneCreateInput,
  ReferralMilestoneUpdateInput,
} from "./validation";

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

// ---------- Referral milestones ----------

function toMilestoneApiRewardType(rewardType: ReferralMilestoneRow["reward_type"]): MilestoneRewardTypeApi {
  return rewardType.toLowerCase() as MilestoneRewardTypeApi;
}

function toMilestoneDbRewardType(rewardType: MilestoneRewardTypeApi): ReferralMilestoneRow["reward_type"] {
  return rewardType.toUpperCase() as ReferralMilestoneRow["reward_type"];
}

function toMilestoneDto(row: ReferralMilestoneRow): ReferralMilestoneDto {
  return {
    id: row.id,
    threshold: row.threshold,
    reward_type: toMilestoneApiRewardType(row.reward_type),
    reward_value: parseFloat(row.reward_value),
    label: row.label,
    is_active: row.is_active,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function createMilestone(input: ReferralMilestoneCreateInput): Promise<ReferralMilestoneDto> {
  await ensureRewardsSchema();
  const pool = getRewardsPool();
  const existing = await pool.query(`SELECT id FROM referral_milestones WHERE threshold = $1`, [
    input.threshold,
  ]);
  if ((existing.rowCount ?? 0) > 0) {
    throw new ApiError(409, "A milestone already exists at this referral count");
  }
  const { rows } = await pool.query<ReferralMilestoneRow>(
    `INSERT INTO referral_milestones (threshold, reward_type, reward_value, label, is_active)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      input.threshold,
      toMilestoneDbRewardType(input.reward_type),
      input.reward_value,
      input.label,
      input.is_active,
    ],
  );
  return toMilestoneDto(rows[0]);
}

export async function listMilestones(activeOnly = false): Promise<ReferralMilestoneDto[]> {
  await ensureRewardsSchema();
  const pool = getRewardsPool();
  const { rows } = await pool.query<ReferralMilestoneRow>(
    `SELECT * FROM referral_milestones ${activeOnly ? "WHERE is_active = true" : ""} ORDER BY threshold ASC`,
  );
  return rows.map(toMilestoneDto);
}

async function findMilestoneRow(id: number): Promise<ReferralMilestoneRow> {
  const pool = getRewardsPool();
  const { rows } = await pool.query<ReferralMilestoneRow>(
    `SELECT * FROM referral_milestones WHERE id = $1`,
    [id],
  );
  if (!rows[0]) {
    throw new ApiError(404, "Milestone not found");
  }
  return rows[0];
}

export async function updateMilestone(
  id: number,
  input: ReferralMilestoneUpdateInput,
): Promise<ReferralMilestoneDto> {
  await ensureRewardsSchema();
  const current = await findMilestoneRow(id);
  const pool = getRewardsPool();
  const { rows } = await pool.query<ReferralMilestoneRow>(
    `UPDATE referral_milestones
     SET threshold = $2, reward_type = $3, reward_value = $4, label = $5, is_active = $6, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [
      id,
      input.threshold ?? current.threshold,
      toMilestoneDbRewardType(input.reward_type ?? toMilestoneApiRewardType(current.reward_type)),
      input.reward_value ?? parseFloat(current.reward_value),
      input.label ?? current.label,
      input.is_active ?? current.is_active,
    ],
  );
  return toMilestoneDto(rows[0]);
}

export async function deleteMilestone(id: number): Promise<void> {
  await ensureRewardsSchema();
  await findMilestoneRow(id);
  const pool = getRewardsPool();
  await pool.query(`DELETE FROM referral_milestones WHERE id = $1`, [id]);
}

export async function getReferralProgress(userId: number): Promise<ReferralProgressDto> {
  await ensureRewardsSchema();
  const owned = await findActiveByOwner(userId);

  // Milestones track people actually referred — i.e. rows in
  // referral_conversions, credited once a referee completes a qualifying
  // booking or wallet top-up (see rewardReferrerIfEligible). This is
  // deliberately NOT referral_codes.use_count, which instead counts how
  // many times the code was redeemed as a discount coupon at checkout — a
  // different, unrelated number that stays 0 for owners whose code was
  // never typed into a coupon field, even after real referrals convert.
  let referralCount = 0;
  if (owned) {
    const pool = getRewardsPool();
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM referral_conversions WHERE referral_code_id = $1`,
      [owned.id],
    );
    referralCount = parseInt(rows[0].count, 10);
  }

  const milestones = await listMilestones(true);
  const achieved = milestones.filter((m) => referralCount >= m.threshold);
  const next = milestones.find((m) => referralCount < m.threshold) ?? null;

  let unclaimed = achieved;
  if (owned && achieved.length > 0) {
    const pool = getRewardsPool();
    const { rows: claimed } = await pool.query<{ milestone_id: number }>(
      `SELECT milestone_id FROM referral_milestone_claims WHERE user_id = $1`,
      [userId],
    );
    const claimedIds = new Set(claimed.map((r) => r.milestone_id));
    unclaimed = achieved.filter((m) => !claimedIds.has(m.id));
  }

  return {
    referral_count: referralCount,
    milestones,
    achieved_milestones: achieved,
    unclaimed_milestones: unclaimed,
    next_milestone: next,
    remaining_to_next: next ? next.threshold - referralCount : null,
  };
}

export async function claimMilestone(input: ClaimMilestoneInput): Promise<ClaimMilestoneResponseDto> {
  await ensureRewardsSchema();
  const owned = await findActiveByOwner(input.user_id);
  if (!owned) {
    throw new ApiError(404, "You don't have a referral code yet");
  }
  const milestoneRow = await findMilestoneRow(input.milestone_id);
  if (owned.use_count < milestoneRow.threshold) {
    throw new ApiError(400, "You haven't reached this milestone yet");
  }

  const pool = getRewardsPool();
  const { rows: existing } = await pool.query(
    `SELECT id FROM referral_milestone_claims WHERE user_id = $1 AND milestone_id = $2`,
    [input.user_id, input.milestone_id],
  );
  if (existing.length > 0) {
    throw new ApiError(409, "You've already claimed this milestone");
  }

  const { rows } = await pool.query<{ claimed_at: Date }>(
    `INSERT INTO referral_milestone_claims (user_id, milestone_id, referral_code_id)
     VALUES ($1, $2, $3) RETURNING claimed_at`,
    [input.user_id, input.milestone_id, owned.id],
  );

  return {
    milestone: toMilestoneDto(milestoneRow),
    claimed_at: rows[0].claimed_at.toISOString(),
  };
}
