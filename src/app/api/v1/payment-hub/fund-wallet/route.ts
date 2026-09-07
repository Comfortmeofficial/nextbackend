import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { fundWalletHub } from "@/modules/paymentHub/service";
import { fundWalletRequestSchema } from "@/modules/paymentHub/validation";

// POST /api/v1/payment-hub/fund-wallet
export async function POST(request: NextRequest) {
  try {
    const input = fundWalletRequestSchema.parse(await request.json());
    if (requireCustomerAuth(request) !== input.user_id) {
      throw new ApiError(403, "Not your wallet");
    }
    const result = await fundWalletHub(input);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
