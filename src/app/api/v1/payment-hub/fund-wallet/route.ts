import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { fundWalletHub } from "@/modules/paymentHub/service";
import { fundWalletRequestSchema } from "@/modules/paymentHub/validation";

// POST /api/v1/payment-hub/fund-wallet
export async function POST(request: NextRequest) {
  try {
    const input = fundWalletRequestSchema.parse(await request.json());
    const result = await fundWalletHub(input);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
