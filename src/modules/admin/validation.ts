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

// Matches schemas.AdminCreateSchema
export const adminCreateSchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().email(),
  password: z.string(),
  role: adminRoleSchema.default("admin"),
});
export type AdminCreateInput = z.infer<typeof adminCreateSchema>;

// Matches schemas.AdminUpdateSchema
export const adminUpdateSchema = z.object({
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  role: adminRoleSchema.nullable().optional(),
  is_active: z.boolean().nullable().optional(),
});
export type AdminUpdateInput = z.infer<typeof adminUpdateSchema>;

// Matches api/v1/auth.py's inline LoginSchema
export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
