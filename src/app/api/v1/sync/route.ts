import { NextRequest, NextResponse } from "next/server";
import { syncErrorResponse } from "@/modules/sync/errors";
import { createSyncRecord, listPending } from "@/modules/sync/repository";
import { createSyncRequestSchema } from "@/modules/sync/validation";

// POST /api/v1/sync
export async function POST(request: NextRequest) {
  try {
    const body = createSyncRequestSchema.parse(await request.json());
    const record = await createSyncRecord({
      reference: body.reference,
      amount: body.amount,
      transactionType: body.transaction_type,
    });
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    return syncErrorResponse(error);
  }
}

// GET /api/v1/sync — despite the generic name, only returns *pending*
// records (matches the source's WHERE status = 'pending'), and always 200s
// even on a backing query failure.
export async function GET() {
  const records = await listPending();
  return NextResponse.json(records);
}
