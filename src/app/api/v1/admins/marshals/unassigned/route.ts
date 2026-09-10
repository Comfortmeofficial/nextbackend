import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { listMarshals } from "@/modules/admin/repository";
import { getBusIdsForMarshals } from "@/modules/buses/repository";

// GET /api/v1/admins/marshals/unassigned — active marshals not currently on
// any bus. Used by the Bus Detail "Assign/Reassign Marshal" dropdown; the
// plain /admins/marshals list stays as the full roster (management page,
// resolving already-assigned marshals' names, etc. all need every marshal).
//
// Enrichment is duplicated from marshals/route.ts rather than shared — that
// route already explains why it composes assigned_bus_ids at the route layer
// (avoids a buses <-> admin module import cycle), and this route only needs
// half of that enrichment (bus ids, not current_ride_id).
export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth(request, OPS_ROLES);
    const marshals = await listMarshals();
    const ids = marshals.map((m) => m.id);
    const busIds = await getBusIdsForMarshals(ids);
    const unassigned = marshals
      .filter((m) => m.is_active && !busIds.get(m.id)?.length)
      .map((m) => ({ ...m, current_ride_id: null, assigned_bus_ids: [] }));
    return NextResponse.json(unassigned);
  } catch (error) {
    return handleRouteError(error);
  }
}
