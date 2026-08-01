import { z } from "zod";

export { idParamSchema, listQuerySchema } from "@/lib/common-validation";

export const rewardTypeSchema = z.enum(["flat", "percentage", "both"]);

// Matches schemas.ReferralCodeCreateSchema
export const referralCodeCreateSchema = z.object({
  code: z.string(),
  reward_type: rewardTypeSchema.default("flat"),
  flat_amount: z.number().default(0),
  percentage: z.number().default(0),
  max_uses: z.number().int().nullable().optional(),
  created_by_admin_id: z.number().int().nullable().optional(),
  owner_user_id: z.number().int().nullable().optional(),
});
export type ReferralCodeCreateInput = z.infer<typeof referralCodeCreateSchema>;

// FastAPI treats `user_id: int` on GET /mine (no path placeholder) as a
// required query parameter.
export const mineQuerySchema = z.object({
  user_id: z.coerce.number().int(),
});

// Matches schemas.ApplyReferralSchema
export const applyReferralSchema = z.object({
  code: z.string(),
  amount: z.number(),
  user_id: z.number().int(),
});
export type ApplyReferralInput = z.infer<typeof applyReferralSchema>;

// Matches schemas.ConvertReferralSchema
export const convertReferralSchema = z.object({
  code: z.string(),
  referee_user_id: z.number().int(),
  trigger: z.enum(["booking", "wallet_funding"]),
});
export type ConvertReferralInput = z.infer<typeof convertReferralSchema>;
