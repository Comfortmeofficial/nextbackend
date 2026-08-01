import { NextRequest, NextResponse } from "next/server";
import { syncErrorResponse } from "@/modules/sync/errors";
import { markFailed } from "@/modules/sync/repository";
import { parseSyncId } from "@/modules/sync/validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/sync/{id}/failed — body is loosely typed in the source (a
// bare JSON value with an optional "error" string field, not a validated
// schema), so this reads it the same way rather than requiring the field.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const id = parseSyncId((await params).id);
    const body = await request.json().catch(() => ({}));
    const errorMessage = typeof body?.error === "string" ? body.error : "unknown error";
    const record = await markFailed(id, errorMessage);
    return NextResponse.json(record);
  } catch (error) {
    return syncErrorResponse(error);
  }
}
