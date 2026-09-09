import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { idParamSchema } from "@/modules/admin/validation";
import { listRidesByMarshal } from "@/modules/booking/repository/rides";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/admins/{id}/trips — this admin's ride history as a marshal,
// for the Bus Marshals profile's Trip History tab. Works for any admin id
// (trivially empty for non-marshal roles, since marshal_admin_id would never
// reference them) so there's no separate marshal-only route needed here.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireAdminAuth(request, OPS_ROLES);
    const id = idParamSchema.parse((await params).id);
    const trips = await listRidesByMarshal(id);
    return NextResponse.json(trips);
  } catch (error) {
    return handleRouteError(error);
  }
}
