import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { MARSHAL_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { listRidesByMarshal } from "@/modules/booking/repository/rides";

// GET /api/v1/rides/mine — the calling marshal's own assigned trips.
export async function GET(request: NextRequest) {
  try {
    const claims = requireAdminAuth(request, MARSHAL_ROLES);
    const rides = await listRidesByMarshal(Number(claims.sub));
    return NextResponse.json(rides);
  } catch (error) {
    return handleRouteError(error);
  }
}
