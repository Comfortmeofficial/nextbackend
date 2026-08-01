import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { idParamSchema } from "@/lib/common-validation";
import { cancelBookingHub } from "@/modules/paymentHub/service";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/payment-hub/cancel-booking/{booking_id}
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const bookingId = idParamSchema.parse((await params).id);
    const result = await cancelBookingHub(bookingId);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
