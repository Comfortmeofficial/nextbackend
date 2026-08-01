import { z } from "zod";

export { idParamSchema, listQuerySchema } from "@/lib/common-validation";

const driverStatusSchema = z.enum(["available", "assigned", "on_trip", "offline", "on_leave", "suspended"]);
const verificationStatusSchema = z.enum(["pending", "under_review", "approved", "rejected", "suspended"]);

// Matches schemas.DriverCreateSchema
export const driverCreateSchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().email(),
  phone: z.string(),
  address: z.string().nullable().optional(),
  emergency_contact: z.string().nullable().optional(),
  next_of_kin: z.string().nullable().optional(),
  license_number: z.string(),
  license_expiry: z.string().nullable().optional(),
  driver_type: z.string().nullable().optional(),
});
export type DriverCreateInput = z.infer<typeof driverCreateSchema>;

// Matches schemas.DriverUpdateSchema — rejection_reason is accepted (so a
// request containing it doesn't 422) but never persisted: the legacy model
// has no such column, so the legacy service silently drops it too (a plain
// setattr() on a SQLAlchemy instance with no matching mapped column is a
// no-op). Faithfully replicated rather than "fixed" into either an error or
// a real field.
export const driverUpdateSchema = z.object({
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  emergency_contact: z.string().nullable().optional(),
  next_of_kin: z.string().nullable().optional(),
  license_number: z.string().nullable().optional(),
  license_expiry: z.string().nullable().optional(),
  driver_type: z.string().nullable().optional(),
  status: driverStatusSchema.nullable().optional(),
  verification_status: verificationStatusSchema.nullable().optional(),
  rejection_reason: z.string().nullable().optional(),
});
export type DriverUpdateInput = z.infer<typeof driverUpdateSchema>;

export const assignBusSchema = z.object({ bus_id: z.number().int() });
export const assignRideSchema = z.object({ ride_id: z.number().int() });

export const driverLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const refreshTokenSchema = z.object({
  refresh_token: z.string(),
});
