import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { deductWallet } from "@/modules/wallet/repository";
import { deductWalletSchema } from "@/modules/wallet/validation";

// POST /api/v1/wallet/deduct — unlike /fund, does NOT auto-create a wallet.
export async function POST(request: NextRequest) {
  try {
    const body = deductWalletSchema.parse(await request.json());
    const tx = await deductWallet(body);
    return NextResponse.json(tx, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
