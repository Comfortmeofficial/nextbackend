import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { sendPaymentNotification } from "@/modules/notifications/service";
import { paymentNotificationSchema } from "@/modules/notifications/validation";

// POST /api/v1/notifications/payment
export async function POST(request: NextRequest) {
  try {
    const data = paymentNotificationSchema.parse(await request.json());
    const result = await sendPaymentNotification(data);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
