import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { sendRideReminder } from "@/modules/notifications/service";
import { rideReminderSchema } from "@/modules/notifications/validation";

// POST /api/v1/notifications/ride-reminder — no email channel, unlike most
// other notification types.
export async function POST(request: NextRequest) {
  try {
    const data = rideReminderSchema.parse(await request.json());
    const result = await sendRideReminder(data);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
