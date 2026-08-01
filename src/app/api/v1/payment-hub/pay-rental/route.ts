import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { payRental } from "@/modules/paymentHub/service";
import { payRentalRequestSchema } from "@/modules/paymentHub/validation";

// POST /api/v1/payment-hub/pay-rental
export async function POST(request: NextRequest) {
  try {
    const input = payRentalRequestSchema.parse(await request.json());
    const result = await payRental(input);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
