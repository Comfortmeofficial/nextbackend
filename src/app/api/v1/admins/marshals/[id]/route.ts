import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { getAdmin } from "@/modules/admin/repository";
import { idParamSchema } from "@/modules/admin/validation";
import { getCurrentRideIdForMarshal } from "@/modules/booking/repository/rides";
import { getBusIdsForMarshal } from "@/modules/buses/repository";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/admins/marshals/{id} — single marshal profile for the Bus
// Marshals detail page, enriched the same way as the list route.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const id = idParamSchema.parse((await params).id);
    const marshal = await getAdmin(id);
    if (!marshal || marshal.role !== "bus_marshal") {
      throw new ApiError(404, "Marshal not found");
    }
    const [currentRideId, busIds] = await Promise.all([
      getCurrentRideIdForMarshal(id),
      getBusIdsForMarshal(id),
    ]);
    return NextResponse.json({ ...marshal, current_ride_id: currentRideId, assigned_bus_ids: busIds });
  } catch (error) {
    return handleRouteError(error);
  }
}
