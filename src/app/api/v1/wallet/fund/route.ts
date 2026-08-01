import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { fundWallet } from "@/modules/wallet/repository";
import { fundWalletSchema } from "@/modules/wallet/validation";

// POST /api/v1/wallet/fund — auto-creates the wallet if the user has none yet.
export async function POST(request: NextRequest) {
  try {
    const body = fundWalletSchema.parse(await request.json());
    const tx = await fundWallet(body);
    return NextResponse.json(tx, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
