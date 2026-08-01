import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { getCurrentDriver } from "@/modules/drivers/guard";

// GET /api/v1/drivers/me — the driver-portal's own profile lookup, scoped to
// the JWT's driver_id rather than trusting a client-supplied id, unlike
// every other route here.
export async function GET(request: NextRequest) {
  try {
    const driver = await getCurrentDriver(request);
    return NextResponse.json(driver);
  } catch (error) {
    return handleRouteError(error);
  }
}
