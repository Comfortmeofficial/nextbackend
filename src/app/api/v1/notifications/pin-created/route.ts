import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { sendPinCreatedNotification } from "@/modules/notifications/service";
import { pinCreatedSchema } from "@/modules/notifications/validation";

// POST /api/v1/notifications/pin-created — still exposed as a real HTTP
// route for any external caller, even though wallet_service (in this app)
// now calls the same logic directly in-process.
export async function POST(request: NextRequest) {
  try {
    const data = pinCreatedSchema.parse(await request.json());
    const result = await sendPinCreatedNotification(data);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
