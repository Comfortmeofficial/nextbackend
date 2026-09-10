import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { listUnassignedDrivers } from "@/modules/drivers/repository";

// GET /api/v1/drivers/unassigned — drivers not currently on any bus. Used by
// the Bus Detail "Assign Driver" dropdown; distinct from /available, which
// only excludes suspended drivers and ignores bus assignment.
export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth(request, OPS_ROLES);
    const drivers = await listUnassignedDrivers();
    return NextResponse.json(drivers);
  } catch (error) {
    return handleRouteError(error);
  }
}
