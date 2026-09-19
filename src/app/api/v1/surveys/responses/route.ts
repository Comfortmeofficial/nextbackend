import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { listSurveyResponses } from "@/modules/booking/survey";

export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth(request, OPS_ROLES);
    const rawRideId = request.nextUrl.searchParams.get("ride_id");
    const rideId = rawRideId ? Number(rawRideId) : undefined;
    return NextResponse.json(await listSurveyResponses(rideId && Number.isInteger(rideId) ? rideId : undefined));
  } catch (error) {
    return handleRouteError(error);
  }
}