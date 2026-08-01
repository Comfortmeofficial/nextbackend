import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { initializePayment } from "@/modules/payments/paystack";
import { initializePaymentSchema } from "@/modules/payments/validation";

// POST /api/v1/payments/initialize
export async function POST(request: NextRequest) {
  try {
    const input = initializePaymentSchema.parse(await request.json());
    const result = await initializePayment(input);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
