import { z } from "zod";

export { idParamSchema } from "@/lib/common-validation";

const transactionTypeSchema = z.enum(["deposit", "withdrawal", "trip_fare", "refund"]);

// Matches schemas.FundWalletSchema
export const fundWalletSchema = z.object({
  user_id: z.number().int(),
  amount: z.number(),
  description: z.string().default("Wallet funding"),
  reference: z.string().nullable().optional(),
});
export type FundWalletInput = z.infer<typeof fundWalletSchema>;

// Matches schemas.DeductWalletSchema
export const deductWalletSchema = z.object({
  user_id: z.number().int(),
  amount: z.number(),
  type: transactionTypeSchema.default("trip_fare"),
  description: z.string(),
  reference: z.string().nullable().optional(),
});
export type DeductWalletInput = z.infer<typeof deductWalletSchema>;

// Matches schemas.SetPinSchema
export const setPinSchema = z.object({
  user_id: z.number().int(),
  pin: z.string(),
});
export type SetPinInput = z.infer<typeof setPinSchema>;

// Matches schemas.VerifyPinSchema
export const verifyPinSchema = z.object({
  user_id: z.number().int(),
  pin: z.string(),
});
export type VerifyPinInput = z.infer<typeof verifyPinSchema>;

// Matches schemas.ChangePinSchema
export const changePinSchema = z.object({
  user_id: z.number().int(),
  current_pin: z.string(),
  new_pin: z.string(),
});
export type ChangePinInput = z.infer<typeof changePinSchema>;

export const listQuerySchema = z.object({
  skip: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().default(50),
});

export const analyticsQuerySchema = z.object({
  range: z.string().default("month"),
});
