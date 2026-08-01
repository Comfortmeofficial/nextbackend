import { z } from "zod";

export { idParamSchema, listQuerySchema } from "@/lib/common-validation";

// Matches schemas.UserCreateSchema
export const userCreateSchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  referral_code: z.string().nullable().optional(),
  emergency_contact_name: z.string().nullable().optional(),
  emergency_contact_phone: z.string().nullable().optional(),
  emergency_contact_relationship: z.string().nullable().optional(),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

// Matches schemas.UserUpdateSchema
export const userUpdateSchema = z.object({
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  emergency_contact_name: z.string().nullable().optional(),
  emergency_contact_phone: z.string().nullable().optional(),
  emergency_contact_relationship: z.string().nullable().optional(),
  push_token: z.string().nullable().optional(),
  push_notifications_enabled: z.boolean().nullable().optional(),
  face_id_enabled: z.boolean().nullable().optional(),
  is_active: z.boolean().nullable().optional(),
  is_verified: z.boolean().nullable().optional(),
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

// Matches the inline PreferencesSchema in api/v1/user.py
export const preferencesSchema = z.object({
  push_notifications_enabled: z.boolean().nullable().optional(),
  face_id_enabled: z.boolean().nullable().optional(),
});
export type PreferencesInput = z.infer<typeof preferencesSchema>;

// Matches the inline PushTokenSchema in api/v1/user.py — push_token is
// required there (plain `str`, not Optional).
export const pushTokenSchema = z.object({
  push_token: z.string(),
});
export type PushTokenInput = z.infer<typeof pushTokenSchema>;
