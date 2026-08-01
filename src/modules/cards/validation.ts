import { z } from "zod";

export { idParamSchema } from "@/lib/common-validation";

// Matches schemas.CardCreateSchema
export const cardCreateSchema = z.object({
  user_id: z.number().int(),
  card_holder_name: z.string(),
  last_four: z.string(),
  card_type: z.string().default("visa"),
  expiry_month: z.string(),
  expiry_year: z.string(),
  bank_name: z.string().nullable().optional(),
  paystack_auth_code: z.string().nullable().optional(),
});
export type CardCreateInput = z.infer<typeof cardCreateSchema>;

// FastAPI treats `user_id: int` with no path placeholder as a required
// query parameter on DELETE /{card_id} and PATCH /{card_id}/default.
export const userIdQuerySchema = z.object({
  user_id: z.coerce.number().int(),
});
