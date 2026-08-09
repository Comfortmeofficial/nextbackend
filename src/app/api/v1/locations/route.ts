import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { locationRepo } from "@/modules/booking/repository/places";
import { listQuerySchema, placeInputSchema } from "@/modules/booking/validation";

// POST /api/v1/locations
export async function POST(request: NextRequest) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const body = placeInputSchema.parse(await request.json());
    const loc = await locationRepo.create(body);
    return NextResponse.json(loc, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

// GET /api/v1/locations?skip=0&limit=100
export async function GET(request: NextRequest) {
  try {
    const { skip, limit } = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const items = await locationRepo.list(skip, limit);
    return NextResponse.json(items);
  } catch (error) {
    return handleRouteError(error);
  }
}
