import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { fetchRouteETA } from "@/modules/booking/external";
import { locationRepo, destinationRepo } from "@/modules/booking/repository/places";

// GET /api/v1/routes/distance?location_id=X&destination_id=Y — driving
// distance between a pickup location and a destination, via Google
// Directions. Used by the "Create Route" admin form to suggest a Distance
// (km) value instead of the admin having to already know/measure it.
export async function GET(request: NextRequest) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const params = request.nextUrl.searchParams;
    const locationId = Number(params.get("location_id"));
    const destinationId = Number(params.get("destination_id"));
    if (!Number.isFinite(locationId) || !Number.isFinite(destinationId)) {
      throw new ApiError(400, "location_id and destination_id are required");
    }

    const [location, destination] = await Promise.all([
      locationRepo.getById(locationId),
      destinationRepo.getById(destinationId),
    ]);

    try {
      const { distanceKm } = await fetchRouteETA(
        location.latitude,
        location.longitude,
        destination.latitude,
        destination.longitude,
      );
      return NextResponse.json({ distance_km: distanceKm });
    } catch (err) {
      throw new ApiError(
        502,
        `could not compute distance: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } catch (error) {
    return handleRouteError(error);
  }
}
