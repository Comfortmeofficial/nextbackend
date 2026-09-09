import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { listRidesByDriver } from "@/modules/booking/repository/rides";
import { idParamSchema } from "@/lib/common-validation";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/drivers/{id}/trips — this driver's full ride history, newest
// first, for the admin dashboard's driver profile.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireAdminAuth(request, OPS_ROLES);
    const id = idParamSchema.parse((await params).id);
    const trips = await listRidesByDriver(id);
    return NextResponse.json(trips);
  } catch (error) {
    return handleRouteError(error);
  }
}
