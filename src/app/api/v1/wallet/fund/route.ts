import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { FINANCE_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { fundWallet } from "@/modules/wallet/repository";
import { fundWalletSchema } from "@/modules/wallet/validation";

// POST /api/v1/wallet/fund — auto-creates the wallet if the user has none
// yet. Direct manual credit — real customer top-ups go through
// payment-hub/fund-wallet, which calls fundWallet() in-process; this HTTP
// route is an admin/finance tool.
export async function POST(request: NextRequest) {
  try {
    requireAdminAuth(request, FINANCE_ROLES);
    const body = fundWalletSchema.parse(await request.json());
    const tx = await fundWallet(body);
    return NextResponse.json(tx, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
