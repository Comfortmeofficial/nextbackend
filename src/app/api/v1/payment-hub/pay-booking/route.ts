import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { payBooking } from "@/modules/paymentHub/service";
import { payBookingRequestSchema } from "@/modules/paymentHub/validation";

// POST /api/v1/payment-hub/pay-booking
export async function POST(request: NextRequest) {
  try {
    const input = payBookingRequestSchema.parse(await request.json());
    if (requireCustomerAuth(request) !== input.user_id) {
      throw new ApiError(403, "Not your account");
    }
    const result = await payBooking(input);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
