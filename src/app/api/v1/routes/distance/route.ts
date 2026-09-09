import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { fetchRouteETA } from "@/modules/booking/external";
import { ensurePlaceGeocoded, locationRepo } from "@/modules/booking/repository/places";

// GET /api/v1/routes/distance?location_id=X&destination_id=Y — driving
// distance between a pickup location and a destination, via Google
// Directions. Used by the "Create Route" admin form to suggest a Distance
// (km) value instead of the admin having to already know/measure it.
// Both ids are locations.id — the admin dashboard's route form picks origin
// and destination from the same unified Locations list, so this only ever
// needs locationRepo, even for the "destination" side (that only gets
// translated to an actual destinations-table row once the route is
// created — see findOrCreatePlaceIdByLocation in repository/places.ts).
export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth(request, OPS_ROLES);
    const params = request.nextUrl.searchParams;
    const locationId = Number(params.get("location_id"));
    const destinationId = Number(params.get("destination_id"));
    if (!Number.isFinite(locationId) || !Number.isFinite(destinationId)) {
      throw new ApiError(400, "location_id and destination_id are required");
    }

    const [locationRaw, destinationRaw] = await Promise.all([
      locationRepo.getById(locationId),
      locationRepo.getById(destinationId),
    ]);
    // Self-heal stale (0,0) coordinates before ever handing them to
    // Directions — see ensurePlaceGeocoded's comment for why these can
    // still be unset even with geocoding configured and working.
    const [location, destination] = await Promise.all([
      ensurePlaceGeocoded("locations", locationRaw),
      ensurePlaceGeocoded("locations", destinationRaw),
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
