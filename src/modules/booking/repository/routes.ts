import { ApiError } from "@/lib/http-errors";
import { ensureBookingSchema, getBookingPool } from "../db";
import type { PlaceRow, RouteDto, RouteRow, RouteStopDto } from "../types";
import type { RouteInput } from "../validation";

function placeDto(row: PlaceRow) {
  return {
    id: row.id,
    name: row.name,
    state: row.state,
    latitude: row.latitude,
    longitude: row.longitude,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

async function loadFullRoute(id: number): Promise<RouteDto | null> {
  const pool = getBookingPool();
  const { rows } = await pool.query<RouteRow>(
    `SELECT * FROM routes WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  const route = rows[0];
  if (!route) return null;

  const { rows: locationRows } = await pool.query<PlaceRow>(`SELECT * FROM locations WHERE id = $1`, [
    route.location_id,
  ]);
  const { rows: destinationRows } = await pool.query<PlaceRow>(
    `SELECT * FROM destinations WHERE id = $1`,
    [route.destination_id],
  );
  const { rows: stopRows } = await pool.query<{
    id: number;
    route_id: number;
    stop_id: number;
    stop_order: number;
    fare: number | null;
    name: string;
    state: string;
    latitude: number;
    longitude: number;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT rs.id, rs.route_id, rs.stop_id, rs.stop_order, rs.fare, s.name, s.state, s.latitude, s.longitude, s.created_at, s.updated_at
     FROM route_stops rs JOIN stops s ON s.id = rs.stop_id
     WHERE rs.route_id = $1 ORDER BY rs.stop_order ASC`,
    [id],
  );

  const stops: RouteStopDto[] = stopRows.map((r) => ({
    id: r.id,
    route_id: r.route_id,
    stop_id: r.stop_id,
    stop_order: r.stop_order,
    fare: r.fare,
    stop: placeDto({
      id: r.stop_id,
      name: r.name,
      state: r.state,
      latitude: r.latitude,
      longitude: r.longitude,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }),
  }));

  return {
    id: route.id,
    name: route.name,
    location_id: route.location_id,
    destination_id: route.destination_id,
    distance_km: route.distance,
    ...(route.estimated_duration_minutes != null
      ? { estimated_duration_minutes: route.estimated_duration_minutes }
      : {}),
    ...(route.google_distance_km != null ? { google_distance_km: route.google_distance_km } : {}),
    location: locationRows[0] ? placeDto(locationRows[0]) : ({} as ReturnType<typeof placeDto>),
    destination: destinationRows[0] ? placeDto(destinationRows[0]) : ({} as ReturnType<typeof placeDto>),
    stops,
    created_at: route.created_at.toISOString(),
    updated_at: route.updated_at.toISOString(),
  };
}

// Unlike Location/Destination/Stop, Route creation failures surface the raw
// underlying error at 500, not a friendly 409 — a real asymmetry in the
// source (Routes.Create's caller uses StatusInternalServerError with
// err.Error(), the other three use a fixed StatusConflict message).
export async function createRoute(input: RouteInput): Promise<RouteDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<RouteRow>(
      `INSERT INTO routes (name, location_id, destination_id, distance) VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.name, input.location_id, input.destination_id, input.distance_km],
    );
    const route = rows[0];
    for (let i = 0; i < input.stops.length; i++) {
      await client.query(
        `INSERT INTO route_stops (route_id, stop_id, stop_order, fare) VALUES ($1, $2, $3, $4)`,
        [route.id, input.stops[i].stop_id, i + 1, input.stops[i].fare ?? null],
      );
    }
    await client.query("COMMIT");
    const full = await loadFullRoute(route.id);
    return full!;
  } catch (err) {
    await client.query("ROLLBACK");
    throw new ApiError(500, err instanceof Error ? err.message : String(err));
  } finally {
    client.release();
  }
}

export async function listRoutes(skip: number, limit: number): Promise<RouteDto[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM routes WHERE deleted_at IS NULL OFFSET $1 LIMIT $2`,
    [skip, limit],
  );
  // Sequential, not Promise.all — loadFullRoute makes 4+ queries per route,
  // so firing all of them at once for N routes bursts to 4N concurrent
  // connections against a pool.Pool with no explicit max (defaults to 10),
  // which was timing out (ETIMEDOUT) against Neon's pooler once there were
  // enough routes to cross that threshold.
  const routes: RouteDto[] = [];
  for (const row of rows) {
    const route = await loadFullRoute(row.id);
    if (route) routes.push(route);
  }
  return routes;
}

export async function getRoute(id: number): Promise<RouteDto> {
  await ensureBookingSchema();
  const route = await loadFullRoute(id);
  if (!route) {
    throw new ApiError(404, "Route not found");
  }
  return route;
}

export async function deleteRoute(id: number): Promise<void> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  await pool.query(`UPDATE routes SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function updateRouteEta(
  id: number,
  durationMinutes: number,
  distanceKm: number,
): Promise<void> {
  const pool = getBookingPool();
  await pool.query(
    `UPDATE routes SET estimated_duration_minutes = $2, google_distance_km = $3, updated_at = now() WHERE id = $1`,
    [id, durationMinutes, distanceKm],
  );
}

export { loadFullRoute };
