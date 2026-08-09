import { z } from "zod";

export const termsDocTypeSchema = z.enum(["terms", "privacy"]);

// Matches schemas.TermsCreateSchema
export const termsCreateSchema = z.object({
  version: z.string(),
  title: z.string(),
  content: z.string(),
  doc_type: termsDocTypeSchema.default("terms"),
  created_by_admin_id: z.number().int().nullable().optional(),
});
export type TermsCreateInput = z.infer<typeof termsCreateSchema>;

export const termsCurrentQuerySchema = z.object({
  doc_type: termsDocTypeSchema.default("terms"),
});

// Matches schemas.TermsUpdateSchema
export const termsUpdateSchema = z.object({
  title: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
});
export type TermsUpdateInput = z.infer<typeof termsUpdateSchema>;

export { idParamSchema, listQuerySchema } from "@/lib/common-validation";
