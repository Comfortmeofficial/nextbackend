import { z } from "zod";
import { idParamSchema } from "@/lib/common-validation";
import { BusError } from "./errors";

export { idParamSchema };

// Axum's Path<i64> extractor rejects a non-numeric id with a 400 before the
// handler body runs at all.
export function parseBusId(raw: string): number {
  const result = idParamSchema.safeParse(raw);
  if (!result.success) {
    throw new BusError(400);
  }
  return result.data;
}

export const busStatusSchema = z.enum(["active", "maintenance", "retired"]);

const seatDefinitionSchema = z.object({
  seat_number: z.string(),
  row: z.number().int(),
  col: z.number().int(),
  is_seat: z.boolean(),
  seat_type: z.string().default(""),
});

const seatLayoutSchema = z.object({
  rows: z.number().int(),
  cols: z.number().int(),
  seats: z.array(seatDefinitionSchema),
});

// Matches CreateBusRequest
export const createBusSchema = z.object({
  plate_number: z.string(),
  model: z.string(),
  rows: z.number().int().nullable().optional(),
  cols: z.number().int().nullable().optional(),
  capacity: z.number().int().nullable().optional(),
  layout: seatLayoutSchema.nullable().optional(),
});
export type CreateBusInput = z.infer<typeof createBusSchema>;

// Matches UpdateBusRequest — every field, present-as-null or absent, means
// "leave unchanged" (serde's Option<T> deserializes both the same way).
// There's deliberately no way to null out driver_id via this endpoint; that
// only happens through DELETE /{id}/driver.
export const updateBusSchema = z.object({
  plate_number: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  status: busStatusSchema.nullable().optional(),
  driver_id: z.number().int().nullable().optional(),
  layout: seatLayoutSchema.nullable().optional(),
});
export type UpdateBusInput = z.infer<typeof updateBusSchema>;

export const assignDriverSchema = z.object({
  driver_id: z.number().int(),
});
