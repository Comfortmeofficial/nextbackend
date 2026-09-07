import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { verifyPaymentHub } from "@/modules/paymentHub/service";

type Params = { params: Promise<{ reference: string }> };

// POST /api/v1/payment-hub/verify/{reference}
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { reference } = await params;
    const userId = requireCustomerAuth(request);
    const result = await verifyPaymentHub(reference, userId);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
