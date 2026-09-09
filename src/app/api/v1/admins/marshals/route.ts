import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { listMarshals } from "@/modules/admin/repository";
import { getCurrentRideIdsForMarshals } from "@/modules/booking/repository/rides";
import { getBusIdsForMarshals } from "@/modules/buses/repository";

// GET /api/v1/admins/marshals — every bus_marshal account (both the ride/bus
// assignment dropdowns and the Bus Marshals management page use this; the
// dropdowns filter out suspended ones client-side). Enriched with
// current_ride_id/assigned_bus_ids — composed here at the route layer rather
// than inside admin/repository.ts's toDto to avoid a buses/booking <-> admin
// module import cycle (buses/repository.ts already imports getAdmin from
// admin/repository.ts).
export async function GET(request: NextRequest) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const marshals = await listMarshals();
    const ids = marshals.map((m) => m.id);
    const [currentRideIds, busIds] = await Promise.all([
      getCurrentRideIdsForMarshals(ids),
      getBusIdsForMarshals(ids),
    ]);
    const enriched = marshals.map((m) => ({
      ...m,
      current_ride_id: currentRideIds.get(m.id) ?? null,
      assigned_bus_ids: busIds.get(m.id) ?? [],
    }));
    return NextResponse.json(enriched);
  } catch (error) {
    return handleRouteError(error);
  }
}
