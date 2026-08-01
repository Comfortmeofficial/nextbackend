import { NextRequest, NextResponse } from "next/server";
import { syncErrorResponse } from "@/modules/sync/errors";
import { markSynced } from "@/modules/sync/repository";
import { parseSyncId } from "@/modules/sync/validation";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const id = parseSyncId((await params).id);
    const record = await markSynced(id);
    return NextResponse.json(record);
  } catch (error) {
    return syncErrorResponse(error);
  }
}
