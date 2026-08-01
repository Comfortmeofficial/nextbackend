import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { requestRental } from "@/modules/paymentHub/service";
import { requestRentalRequestSchema } from "@/modules/paymentHub/validation";

// POST /api/v1/payment-hub/request-rental
export async function POST(request: NextRequest) {
  try {
    const input = requestRentalRequestSchema.parse(await request.json());
    const result = await requestRental(input);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
