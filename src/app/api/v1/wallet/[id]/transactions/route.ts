import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { getTransactions } from "@/modules/wallet/repository";
import { idParamSchema, listQuerySchema } from "@/modules/wallet/validation";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/wallet/{user_id}/transactions — no wallet yet just means an
// empty list, not a 404 (unlike GET /{user_id} itself, which auto-creates).
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = idParamSchema.parse((await params).id);
    if (requireCustomerAuth(request) !== userId) {
      throw new ApiError(403, "Not your wallet");
    }
    const { skip, limit } = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const transactions = await getTransactions(userId, skip, limit);
    return NextResponse.json(transactions);
  } catch (error) {
    return handleRouteError(error);
  }
}
