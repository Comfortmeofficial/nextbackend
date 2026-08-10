import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { listMarshals } from "@/modules/admin/repository";

// GET /api/v1/admins/marshals — active bus_marshal accounts, for the ride
// assignment dropdown. Scoped narrower than GET /api/v1/admins so
// operations_manager can populate it without full admin-roster visibility.
export async function GET(request: NextRequest) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const marshals = await listMarshals();
    return NextResponse.json(marshals);
  } catch (error) {
    return handleRouteError(error);
  }
}
