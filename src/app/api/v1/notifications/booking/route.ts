import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { sendBookingNotification } from "@/modules/notifications/service";
import { bookingNotificationSchema } from "@/modules/notifications/validation";

// POST /api/v1/notifications/booking
export async function POST(request: NextRequest) {
  try {
    const data = bookingNotificationSchema.parse(await request.json());
    const result = await sendBookingNotification(data);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
