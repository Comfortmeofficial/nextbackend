import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { sendOtpNotification } from "@/modules/notifications/service";
import { otpNotificationSchema } from "@/modules/notifications/validation";

// POST /api/v1/notifications/otp — always 200 regardless of whether any
// channel actually succeeded; the source never checks provider return values.
export async function POST(request: NextRequest) {
  try {
    const data = otpNotificationSchema.parse(await request.json());
    const result = await sendOtpNotification(data);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
