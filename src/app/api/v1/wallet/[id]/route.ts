import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { getWallet } from "@/modules/wallet/repository";
import { idParamSchema } from "@/modules/wallet/validation";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/wallet/{user_id} — a GET with a side effect: a user with no
// wallet yet gets one auto-created with a zero balance, matching
// get_or_create in the source.
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const userId = idParamSchema.parse((await params).id);
    const wallet = await getWallet(userId);
    return NextResponse.json(wallet);
  } catch (error) {
    return handleRouteError(error);
  }
}
