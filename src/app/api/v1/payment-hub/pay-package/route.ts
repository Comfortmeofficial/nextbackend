import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { payPackage } from "@/modules/paymentHub/service";
import { payPackageRequestSchema } from "@/modules/paymentHub/validation";

// POST /api/v1/payment-hub/pay-package
export async function POST(request: NextRequest) {
  try {
    const input = payPackageRequestSchema.parse(await request.json());
    const result = await payPackage(input);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
