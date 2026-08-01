import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { chargeAuthorization } from "@/modules/payments/paystack";
import { chargeAuthorizationSchema } from "@/modules/payments/validation";

// POST /api/v1/payments/charge
export async function POST(request: NextRequest) {
  try {
    const input = chargeAuthorizationSchema.parse(await request.json());
    const result = await chargeAuthorization(input);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
