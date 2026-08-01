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
