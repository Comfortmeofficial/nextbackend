import { z } from "zod";

export { idParamSchema, listQuerySchema } from "@/lib/common-validation";

// active = currently on a trip (set automatically by the ride lifecycle,
// see setDriverTripStatus — not admin-settable); inactive = everything else
// non-suspended; suspended = admin-only.
const driverStatusSchema = z.enum(["active", "inactive", "suspended"]);

// Matches schemas.DriverCreateSchema. No separate emergency_contact — the
// next of kin doubles as the emergency contact, so we collect their name
// (next_of_kin), phone, and relationship to the driver instead.
export const driverCreateSchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().email(),
  phone: z.string(),
  address: z.string().nullable().optional(),
  next_of_kin: z.string().nullable().optional(),
  next_of_kin_phone: z.string().nullable().optional(),
  next_of_kin_relationship: z.string().nullable().optional(),
  license_number: z.string(),
  license_expiry: z.string().nullable().optional(),
});
export type DriverCreateInput = z.infer<typeof driverCreateSchema>;

export const driverUpdateSchema = z.object({
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  next_of_kin: z.string().nullable().optional(),
  next_of_kin_phone: z.string().nullable().optional(),
  next_of_kin_relationship: z.string().nullable().optional(),
  license_number: z.string().nullable().optional(),
  license_expiry: z.string().nullable().optional(),
  status: driverStatusSchema.nullable().optional(),
});
export type DriverUpdateInput = z.infer<typeof driverUpdateSchema>;

export const driverLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const refreshTokenSchema = z.object({
  refresh_token: z.string(),
});
