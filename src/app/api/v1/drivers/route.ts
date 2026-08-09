import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { createDriver, listDrivers } from "@/modules/drivers/repository";
import { driverCreateSchema } from "@/modules/drivers/validation";
import { listQuerySchema } from "@/lib/common-validation";

// POST /api/v1/drivers/
export async function POST(request: NextRequest) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const body = driverCreateSchema.parse(await request.json());
    const driver = await createDriver(body);
    return NextResponse.json(driver, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

// GET /api/v1/drivers/?skip=0&limit=100
export async function GET(request: NextRequest) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const { skip, limit } = listQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const drivers = await listDrivers(skip, limit);
    return NextResponse.json(drivers);
  } catch (error) {
    return handleRouteError(error);
  }
}
