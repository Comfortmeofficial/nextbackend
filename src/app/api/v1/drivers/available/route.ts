import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { listAvailableDrivers } from "@/modules/drivers/repository";

// GET /api/v1/drivers/available
export async function GET(request: NextRequest) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const drivers = await listAvailableDrivers();
    return NextResponse.json(drivers);
  } catch (error) {
    return handleRouteError(error);
  }
}
