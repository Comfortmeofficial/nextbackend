import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { verifyPayment } from "@/modules/payments/paystack";

type Params = { params: Promise<{ reference: string }> };

// GET /api/v1/payments/verify/{reference}
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { reference } = await params;
    const result = await verifyPayment(reference);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
