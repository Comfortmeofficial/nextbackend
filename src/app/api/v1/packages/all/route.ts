import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { listAllPackages } from "@/modules/booking/repository/packages";

// GET /api/v1/packages/all?skip=0&limit=20&ride_id= — admin-facing view.
export async function GET(request: NextRequest) {
  try {
    const skip = Number(request.nextUrl.searchParams.get("skip") ?? "0") || 0;
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "20") || 20;
    const rideId = Number(request.nextUrl.searchParams.get("ride_id") ?? "0") || undefined;
    const items = await listAllPackages(skip, limit, rideId);
    return NextResponse.json(items);
  } catch (error) {
    return handleRouteError(error);
  }
}
