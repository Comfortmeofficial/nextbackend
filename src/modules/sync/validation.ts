import { z } from "zod";
import { idParamSchema } from "@/lib/common-validation";
import { SyncError } from "./errors";

export const createSyncRequestSchema = z.object({
  reference: z.string(),
  amount: z.number(),
  transaction_type: z.string(),
});

// Axum's Path<i64> extractor rejects a non-numeric id with a 400 before the
// handler body runs — same as bus_service's parseBusId.
export function parseSyncId(raw: string): number {
  const result = idParamSchema.safeParse(raw);
  if (!result.success) {
    throw new SyncError(400);
  }
  return result.data;
}
