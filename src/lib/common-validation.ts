import { z } from "zod";

// Shared across service modules for FastAPI-style `{id}: int` path params
// and `skip`/`limit` query params.
export const idParamSchema = z.coerce.number().int();

export const listQuerySchema = z.object({
  skip: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().default(100),
});
