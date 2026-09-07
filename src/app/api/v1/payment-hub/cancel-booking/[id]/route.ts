import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { idParamSchema } from "@/lib/common-validation";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { cancelBookingHub } from "@/modules/paymentHub/service";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/payment-hub/cancel-booking/{booking_id}
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const bookingId = idParamSchema.parse((await params).id);
    const userId = requireCustomerAuth(request);
    const result = await cancelBookingHub(bookingId, userId);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
