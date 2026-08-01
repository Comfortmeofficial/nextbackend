import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { verifyPaymentHub } from "@/modules/paymentHub/service";

type Params = { params: Promise<{ reference: string }> };

// POST /api/v1/payment-hub/verify/{reference}
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { reference } = await params;
    const result = await verifyPaymentHub(reference);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
