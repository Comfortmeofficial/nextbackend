import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { sendRideUpdate } from "@/modules/notifications/service";
import { rideUpdateSchema } from "@/modules/notifications/validation";

// POST /api/v1/notifications/ride-update — also no email channel.
export async function POST(request: NextRequest) {
  try {
    const data = rideUpdateSchema.parse(await request.json());
    const result = await sendRideUpdate(data);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
