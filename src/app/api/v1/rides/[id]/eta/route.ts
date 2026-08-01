import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { fetchRouteETA } from "@/modules/booking/external";
import { getRide } from "@/modules/booking/repository/rides";
import { updateRouteEta } from "@/modules/booking/repository/routes";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/rides/{id}/eta — a static (non-live) ETA: the driving
// duration/distance between the route's origin and destination, computed
// once via Google Directions and cached on the route for every future ride
// on it.
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const ride = await getRide(id);

    let durationMinutes = ride.route.estimated_duration_minutes;
    let distanceKm = ride.route.google_distance_km;
    if (durationMinutes == null || distanceKm == null) {
      try {
        const eta = await fetchRouteETA(
          ride.route.location.latitude,
          ride.route.location.longitude,
          ride.route.destination.latitude,
          ride.route.destination.longitude,
        );
        durationMinutes = eta.durationMinutes;
        distanceKm = eta.distanceKm;
      } catch (err) {
        throw new ApiError(
          502,
          `could not compute ETA: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      await updateRouteEta(ride.route.id, durationMinutes, distanceKm);
    }

    const arrival = new Date(new Date(ride.departure_time).getTime() + durationMinutes * 60 * 1000);
    return NextResponse.json({
      estimated_duration_minutes: durationMinutes,
      estimated_distance_km: distanceKm,
      estimated_arrival_time: arrival.toISOString(),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
