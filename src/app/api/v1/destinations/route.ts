import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { destinationRepo } from "@/modules/booking/repository/places";
import { listQuerySchema, placeInputSchema } from "@/modules/booking/validation";

export async function POST(request: NextRequest) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const body = placeInputSchema.parse(await request.json());
    const dest = await destinationRepo.create(body);
    return NextResponse.json(dest, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { skip, limit } = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const items = await destinationRepo.list(skip, limit);
    return NextResponse.json(items);
  } catch (error) {
    return handleRouteError(error);
  }
}
