import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { getAdmin } from "@/modules/admin/repository";
import { updateRideMarshal } from "@/modules/booking/repository/rides";
import { parseBookingId } from "@/modules/booking/util";
import { rideMarshalInputSchema } from "@/modules/booking/validation";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/v1/rides/{id}/marshal — assign (or, with marshal_admin_id:
// null, unassign) the bus marshal conducting this trip.
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const { marshal_admin_id } = rideMarshalInputSchema.parse(await request.json());

    if (marshal_admin_id === null) {
      const ride = await updateRideMarshal(id, null, null);
      return NextResponse.json(ride);
    }

    const marshal = await getAdmin(marshal_admin_id);
    if (!marshal || !marshal.is_active || marshal.role !== "bus_marshal") {
      throw new ApiError(400, `marshal ${marshal_admin_id} not found or not an active bus_marshal`);
    }
    const ride = await updateRideMarshal(id, marshal.id, `${marshal.first_name} ${marshal.last_name}`.trim());
    return NextResponse.json(ride);
  } catch (error) {
    return handleRouteError(error);
  }
}
