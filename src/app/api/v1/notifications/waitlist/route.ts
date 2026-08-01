import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { sendWaitlistNotification } from "@/modules/notifications/service";
import { waitlistNotificationSchema } from "@/modules/notifications/validation";

// POST /api/v1/notifications/waitlist — email only, no DB write at all (this
// is the one endpoint the source never calls _store() from).
export async function POST(request: NextRequest) {
  try {
    const data = waitlistNotificationSchema.parse(await request.json());
    const result = await sendWaitlistNotification(data);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
