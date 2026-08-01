import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { getAllTransactions } from "@/modules/wallet/repository";
import { listQuerySchema } from "@/modules/wallet/validation";

// GET /api/v1/wallet/transactions — admin-facing, cross-user view. Must
// stay registered before /{user_id} so this literal segment isn't swallowed
// as a user_id path param (Next.js resolves this automatically via its
// file-system router, unlike FastAPI where declaration order mattered).
export async function GET(request: NextRequest) {
  try {
    const { skip, limit } = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const transactions = await getAllTransactions(skip, limit);
    return NextResponse.json(transactions);
  } catch (error) {
    return handleRouteError(error);
  }
}
