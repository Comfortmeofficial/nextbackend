import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { FINANCE_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { deductWallet } from "@/modules/wallet/repository";
import { deductWalletSchema } from "@/modules/wallet/validation";

// POST /api/v1/wallet/deduct — unlike /fund, does NOT auto-create a wallet.
// Direct manual wallet debit — payment-hub calls deductWallet() from the
// repository in-process for real transactions, so nothing legitimate hits
// this HTTP route; it's an admin/finance tool, not a customer-facing one.
export async function POST(request: NextRequest) {
  try {
    requireAdminAuth(request, FINANCE_ROLES);
    const body = deductWalletSchema.parse(await request.json());
    const tx = await deductWallet(body);
    return NextResponse.json(tx, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
