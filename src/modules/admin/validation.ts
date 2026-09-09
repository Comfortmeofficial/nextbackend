import { z } from "zod";

export { idParamSchema, listQuerySchema } from "@/lib/common-validation";

const adminRoleSchema = z.enum([
  "super_admin",
  "admin",
  "operations_manager",
  "customer_support",
  "finance_officer",
  "bus_marshal",
]);

// Matches schemas.AdminCreateSchema, plus the optional contact/next-of-kin
// fields added for the Bus Marshals page.
export const adminCreateSchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().email(),
  password: z.string(),
  role: adminRoleSchema.default("admin"),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  next_of_kin: z.string().nullable().optional(),
  next_of_kin_phone: z.string().nullable().optional(),
  next_of_kin_relationship: z.string().nullable().optional(),
});
export type AdminCreateInput = z.infer<typeof adminCreateSchema>;

// Matches schemas.AdminUpdateSchema, plus the same additions.
export const adminUpdateSchema = z.object({
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  role: adminRoleSchema.nullable().optional(),
  is_active: z.boolean().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  next_of_kin: z.string().nullable().optional(),
  next_of_kin_phone: z.string().nullable().optional(),
  next_of_kin_relationship: z.string().nullable().optional(),
});
export type AdminUpdateInput = z.infer<typeof adminUpdateSchema>;

// Matches api/v1/auth.py's inline LoginSchema
export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
