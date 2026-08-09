export type RewardTypeDb = "FLAT" | "PERCENTAGE" | "BOTH";
export type RewardTypeApi = "flat" | "percentage" | "both";

export interface ReferralCodeRow {
  id: number;
  code: string;
  created_by_admin_id: number | null;
  owner_user_id: number | null;
  reward_type: RewardTypeDb;
  flat_amount: string; // NUMERIC comes back as a string from node-postgres
  percentage: string;
  max_uses: number | null;
  use_count: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Matches schemas.ReferralCodeSchema
export interface ReferralCodeDto {
  id: number;
  code: string;
  reward_type: RewardTypeApi;
  flat_amount: number;
  percentage: number;
  max_uses: number | null;
  use_count: number;
  is_active: boolean;
  created_at: string;
}

// Matches schemas.ApplyReferralResponse
export interface ApplyReferralResponseDto {
  code: string;
  discount_amount: number;
  original_amount: number;
  final_amount: number;
}

// Matches schemas.ConvertReferralResponse
export interface ConvertReferralResponseDto {
  rewarded: boolean;
  referrer_user_id?: number | null;
  reward_amount?: number | null;
}

export type MilestoneRewardTypeDb = "FLAT" | "PERCENTAGE";
export type MilestoneRewardTypeApi = "flat" | "percentage";

export interface ReferralMilestoneRow {
  id: number;
  threshold: number;
  reward_type: MilestoneRewardTypeDb;
  reward_value: string; // NUMERIC comes back as a string from node-postgres
  label: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ReferralMilestoneDto {
  id: number;
  threshold: number;
  reward_type: MilestoneRewardTypeApi;
  reward_value: number;
  label: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReferralProgressDto {
  // Count of people actually referred (referral_conversions rows) — not
  // referral_codes.use_count, which tracks coupon redemptions instead.
  referral_count: number;
  milestones: ReferralMilestoneDto[];
  achieved_milestones: ReferralMilestoneDto[];
  unclaimed_milestones: ReferralMilestoneDto[];
  next_milestone: ReferralMilestoneDto | null;
  remaining_to_next: number | null;
}

export interface ClaimMilestoneResponseDto {
  milestone: ReferralMilestoneDto;
  claimed_at: string;
}
