import { z } from "zod";

// Matches schemas.InitializePaymentSchema
export const initializePaymentSchema = z.object({
  amount: z.number(),
  email: z.string(),
  reference: z.string().nullable().optional(),
  callback_url: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});
export type InitializePaymentInput = z.infer<typeof initializePaymentSchema>;

// Matches schemas.ChargeAuthorizationSchema
export const chargeAuthorizationSchema = z.object({
  authorization_code: z.string(),
  email: z.string(),
  amount: z.number(),
  reference: z.string().nullable().optional(),
});
export type ChargeAuthorizationInput = z.infer<typeof chargeAuthorizationSchema>;
