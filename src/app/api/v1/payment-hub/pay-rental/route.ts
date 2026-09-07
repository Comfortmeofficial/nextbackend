import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { payRental } from "@/modules/paymentHub/service";
import { payRentalRequestSchema } from "@/modules/paymentHub/validation";

// POST /api/v1/payment-hub/pay-rental
export async function POST(request: NextRequest) {
  try {
    const input = payRentalRequestSchema.parse(await request.json());
    if (requireCustomerAuth(request) !== input.user_id) {
      throw new ApiError(403, "Not your rental");
    }
    const result = await payRental(input);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
