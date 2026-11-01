import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { cancelStaleDepartedRides } from "@/modules/paymentHub/service";

// POST /api/v1/rides/cancel-stale — cleans up rides whose departure time
// has already passed with no status ever advancing past 'scheduled' (ride
// status is purely event-driven, never time-driven — see the note on
// listStaleDepartedRideIds). Cancels each one and fully refunds (no fee)
// anyone still booked on it, since there's no way to tell from the data
// alone whether the trip actually happened. Safe to call again later if
// more stale rides accumulate — already-resolved rides just won't match.
export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminAuth(request, OPS_ROLES);
    const summary = await cancelStaleDepartedRides();
    recordAuditLog(actor, request, "UPDATE", "ride", null, {
      action: "cancel_stale_departed_rides",
      ...summary,
    });
    return NextResponse.json(summary);
  } catch (error) {
    return handleRouteError(error);
  }
}
