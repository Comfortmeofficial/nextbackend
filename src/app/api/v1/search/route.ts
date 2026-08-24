import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { searchRides } from "@/modules/booking/repository/rides";
import { searchInputSchema } from "@/modules/booking/validation";

// POST /api/v1/search — note default limit here is 20, unlike the 100 used
// by most other list endpoints in this service.
export async function POST(request: NextRequest) {
  try {
    const body = searchInputSchema.parse(await request.json());
    const skip = Number(request.nextUrl.searchParams.get("skip") ?? "0") || 0;
    const defaultLimit = body.from_date || body.to_date ? 200 : 20;
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? String(defaultLimit)) || defaultLimit;
    const results = await searchRides(
      body.location,
      body.destination,
      skip,
      limit,
      body.from_date,
      body.to_date,
    );
    return NextResponse.json(results);
  } catch (error) {
    return handleRouteError(error);
  }
}
