import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { payPackage } from "@/modules/paymentHub/service";
import { payPackageRequestSchema } from "@/modules/paymentHub/validation";

// POST /api/v1/payment-hub/pay-package
export async function POST(request: NextRequest) {
  try {
    const input = payPackageRequestSchema.parse(await request.json());
    if (requireCustomerAuth(request) !== input.sender_user_id) {
      throw new ApiError(403, "Not your account");
    }
    const result = await payPackage(input);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
