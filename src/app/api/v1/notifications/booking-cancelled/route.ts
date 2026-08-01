import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { sendBookingCancelledNotification } from "@/modules/notifications/service";
import { bookingCancelledSchema } from "@/modules/notifications/validation";

// POST /api/v1/notifications/booking-cancelled
export async function POST(request: NextRequest) {
  try {
    const data = bookingCancelledSchema.parse(await request.json());
    const result = await sendBookingCancelledNotification(data);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
