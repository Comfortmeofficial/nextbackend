import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { fetchBusInfo, fetchDriverInfo } from "@/modules/booking/external";
import { createRide, listRides, seatDefsFromBusSeats } from "@/modules/booking/repository/rides";
import { createRoute } from "@/modules/booking/repository/routes";
import { listQuerySchema, rideInputSchema } from "@/modules/booking/validation";

function parseRfc3339(value: string, field: string): Date {
  // Go's time.Parse(time.RFC3339, ...) is strict about the offset/format;
  // JS Date parsing is looser but rejects genuinely malformed strings too,
  // which covers the same real-world failure mode (a client sending garbage).
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(
      400,
      field === "departure_time"
        ? "departure_time must be RFC3339 (e.g. 2026-06-10T08:00:00Z)"
        : "arrival_time must be RFC3339",
    );
  }
  return date;
}

// POST /api/v1/rides
export async function POST(request: NextRequest) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const input = rideInputSchema.parse(await request.json());
    const departureTime = parseRfc3339(input.departure_time, "departure_time");
    const arrivalTime = input.arrival_time ? parseRfc3339(input.arrival_time, "arrival_time") : null;

    let driver;
    try {
      driver = await fetchDriverInfo(input.driver_id);
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : String(err));
    }
    let bus;
    try {
      bus = await fetchBusInfo(input.bus_id);
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : String(err));
    }

    const { seatDefs, driverRow, driverCol } = seatDefsFromBusSeats(bus.seats);
    if (seatDefs.length === 0) {
      throw new ApiError(400, `bus ${input.bus_id} has no seats configured — set its layout before scheduling rides`);
    }

    const route = await createRoute(input.route);

    const ride = await createRide({
      routeId: route.id,
      busId: input.bus_id,
      driverId: input.driver_id,
      driverName: driver.fullName,
      driverRating: driver.rating,
      busPlate: bus.plateNumber,
      busModel: bus.model,
      departureTime,
      arrivalTime,
      fare: input.fare,
      totalSeats: seatDefs.length,
      seatDefs,
      driverRow,
      driverCol,
      scheduleId: null,
    });
    return NextResponse.json(ride, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

// GET /api/v1/rides?skip=0&limit=100&status=
export async function GET(request: NextRequest) {
  try {
    const { skip, limit } = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const rides = await listRides(skip, limit, status);
    return NextResponse.json(rides);
  } catch (error) {
    return handleRouteError(error);
  }
}
