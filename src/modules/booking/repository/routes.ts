import { ApiError } from "@/lib/http-errors";
import { ensureBookingSchema, getBookingPool } from "../db";
import { findOrCreatePlaceIdByLocation } from "./places";
import type { PlaceRow, RouteDto, RouteRow, RouteStatus, RouteStopDto } from "../types";
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
    status: route.status,
    tags: route.tags,
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
//
// input.location_id, input.destination_id, and every input.stops[i].stop_id
// are all locations.id now — the admin dashboard's single unified Locations
// picker is the only source of place ids it ever sends. location_id is used
// directly (routes.location_id already points at locations); destination_id
// and each stop_id are resolved to their destinations/stops-table
// counterpart first, via findOrCreatePlaceIdByLocation, before the insert —
// see that function's comment for why those two tables still exist
// separately. Resolution happens before the transaction starts since it
// does its own reads/writes against different tables, not routes/route_stops.
async function insertRoute(input: RouteInput): Promise<RouteDto> {
  await ensureBookingSchema();
  const [destinationId, stopIds] = await Promise.all([
    findOrCreatePlaceIdByLocation("destinations", input.destination_id),
    Promise.all(input.stops.map((s) => findOrCreatePlaceIdByLocation("stops", s.stop_id))),
  ]);

  const pool = getBookingPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<RouteRow>(
      `INSERT INTO routes (name, location_id, destination_id, distance, tags) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [input.name, input.location_id, destinationId, input.distance_km, JSON.stringify(input.tags)],
    );
    const route = rows[0];
    for (let i = 0; i < input.stops.length; i++) {
      await client.query(
        `INSERT INTO route_stops (route_id, stop_id, stop_order) VALUES ($1, $2, $3)`,
        [route.id, stopIds[i], i + 1],
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

// A route already going the other way — matched by place name through the
// destinations mirror table, since routes.destination_id points at
// destinations, not locations directly (see findOrCreatePlaceIdByLocation).
async function findReturnRouteId(originalLocationId: number, originalDestinationId: number): Promise<number | null> {
  const pool = getBookingPool();
  const { rows } = await pool.query<{ id: number }>(
    `SELECT r.id FROM routes r
     JOIN destinations d ON d.id = r.destination_id
     WHERE r.deleted_at IS NULL
       AND r.location_id = $1
       AND d.name = (SELECT name FROM locations WHERE id = $2)
     LIMIT 1`,
    [originalDestinationId, originalLocationId],
  );
  return rows[0]?.id ?? null;
}

// Every route an admin creates has an opposite-direction counterpart in real
// life (the bus that goes A -> B also comes back B -> A), so creating one
// creates both — but as two fully independent route rows, not a linked
// pair: each keeps its own name/status/stops and can be paused or edited
// without touching the other. This is what lets the customer app's return-
// trip search (searchRides matching the swapped location/destination) find
// a result the first time an admin sets up a route, without them having to
// remember to build the reverse leg by hand.
export async function createRoute(input: RouteInput, options?: { createReturn?: boolean }): Promise<RouteDto> {
  const route = await insertRoute(input);

  const createReturn = options?.createReturn ?? true;
  if (createReturn && input.location_id !== input.destination_id) {
    try {
      const existingReturnId = await findReturnRouteId(input.location_id, input.destination_id);
      if (!existingReturnId) {
        const names = await getBookingPool().query<{ id: number; name: string }>(
          `SELECT id, name FROM locations WHERE id = ANY($1::int[])`,
          [[input.location_id, input.destination_id]],
        );
        const nameById = new Map(names.rows.map((r) => [r.id, r.name]));
        const pickupName = nameById.get(input.location_id);
        const destinationName = nameById.get(input.destination_id);
        await insertRoute({
          name: pickupName && destinationName ? `${destinationName} — ${pickupName}` : `${input.name} (Return)`,
          location_id: input.destination_id,
          destination_id: input.location_id,
          distance_km: input.distance_km,
          stops: [...input.stops].reverse(),
          tags: input.tags,
        });
      }
    } catch (err) {
      // Best-effort — the admin's requested route was created either way;
      // they can always add the reverse leg by hand from the Routes page.
      console.error("[routes] failed to auto-create return route:", err);
    }
  }

  return route;
}

// Full edit — replaces name/location/destination/distance/tags/stops in one
// go, same "unconditional full-row save" semantics as PlaceRepo.update (no
// partial-update support). Does not touch status or re-trigger the
// auto-return-route creation from createRoute — editing an existing route
// never spawns a new one.
export async function updateRoute(id: number, input: RouteInput): Promise<RouteDto> {
  await ensureBookingSchema();
  await getRoute(id);

  const [destinationId, stopIds] = await Promise.all([
    findOrCreatePlaceIdByLocation("destinations", input.destination_id),
    Promise.all(input.stops.map((s) => findOrCreatePlaceIdByLocation("stops", s.stop_id))),
  ]);

  const pool = getBookingPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE routes SET name = $2, location_id = $3, destination_id = $4, distance = $5, tags = $6, updated_at = now() WHERE id = $1`,
      [id, input.name, input.location_id, destinationId, input.distance_km, JSON.stringify(input.tags)],
    );
    await client.query(`DELETE FROM route_stops WHERE route_id = $1`, [id]);
    for (let i = 0; i < input.stops.length; i++) {
      await client.query(
        `INSERT INTO route_stops (route_id, stop_id, stop_order) VALUES ($1, $2, $3)`,
        [id, stopIds[i], i + 1],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw new ApiError(500, err instanceof Error ? err.message : String(err));
  } finally {
    client.release();
  }
  return (await loadFullRoute(id))!;
}

export async function listRoutes(skip: number, limit: number, status?: RouteStatus): Promise<RouteDto[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const conditions = ["deleted_at IS NULL"];
  const params: unknown[] = [];
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  params.push(skip, limit);
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM routes WHERE ${conditions.join(" AND ")} ORDER BY name ASC OFFSET $${params.length - 1} LIMIT $${params.length}`,
    params,
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

// Same pause-not-delete pattern as ride schedule status: marking a route
// inactive only stops it being offered for new schedules/rides going
// forward (see the active-only filter on GET /routes and the check in
// POST /rides and /ride-schedules) — it never touches anything already
// generated that references this route.
export async function updateRouteStatus(id: number, status: RouteStatus): Promise<RouteDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<{ id: number }>(
    `UPDATE routes SET status = $2, updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [id, status],
  );
  if (!rows[0]) throw new ApiError(404, "Route not found");
  return getRoute(id);
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
