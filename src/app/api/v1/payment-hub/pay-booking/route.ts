import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { payBooking } from "@/modules/paymentHub/service";
import { payBookingRequestSchema } from "@/modules/paymentHub/validation";

// POST /api/v1/payment-hub/pay-booking
export async function POST(request: NextRequest) {
  try {
    const input = payBookingRequestSchema.parse(await request.json());
    const result = await payBooking(input);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
