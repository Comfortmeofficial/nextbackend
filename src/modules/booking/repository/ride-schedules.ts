import { ApiError } from "@/lib/http-errors";
import { assertDriverAssignable } from "@/modules/drivers/repository";
import { ensureBookingSchema, getBookingPool } from "../db";
import { fetchBusInfo, fetchDriverInfo, fetchMarshalInfo } from "../external";
import type { PlaceRow, RideScheduleDto, RideScheduleRow, RideScheduleStatus } from "../types";
import type { RideScheduleInput } from "../validation";
import { createRoute, getRoute, loadFullRoute } from "./routes";
import { createRide, seatDefsFromBusSeats } from "./rides";

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

async function toDto(row: RideScheduleRow): Promise<RideScheduleDto> {
  const pool = getBookingPool();

  // route_id is the live reference for schedules created/edited after
  // Routes became reusable — its own name/location/destination/distance/
  // stops are authoritative. Older rows have no route_id at all, and a
  // route_id can also now point at a route that's since been deleted (the
  // Routes page got a real Delete in addition to Active/Inactive) — both
  // cases fall back to the denormalized snapshot columns captured back when
  // this schedule was created (see the note on RideScheduleRow). This must
  // never throw: one schedule with a stale route_id used to take down the
  // *entire* list (toDto ran inside Promise.all with nothing catching a
  // single row's failure), 404-ing GET /ride-schedules outright.
  let routeName: string;
  let locationId: number;
  let destinationId: number;
  let distanceKm: number;
  let stops: RideScheduleRow["stops"];
  let locationDto: ReturnType<typeof placeDto> | undefined;
  let destinationDto: ReturnType<typeof placeDto> | undefined;

  const route = row.route_id ? await loadFullRoute(row.route_id) : null;
  if (route) {
    routeName = route.name;
    locationId = route.location_id;
    destinationId = route.destination_id;
    distanceKm = route.distance_km;
    stops = route.stops.map((s) => ({ stop_id: s.stop_id, fare: s.fare }));
    locationDto = route.location as ReturnType<typeof placeDto>;
    destinationDto = route.destination as ReturnType<typeof placeDto>;
  } else {
    // A row this old always has these populated in practice (they were
    // required at insert time before route_id existed) — the fallbacks
    // here are purely defensive, not an expected path.
    routeName = row.route_name ?? "Unknown route";
    locationId = row.location_id ?? 0;
    destinationId = row.destination_id ?? 0;
    distanceKm = row.distance_km ?? 0;
    stops = row.stops ?? [];
    const [{ rows: locationRows }, { rows: destinationRows }] = await Promise.all([
      pool.query<PlaceRow>(`SELECT * FROM locations WHERE id = $1`, [locationId]),
      pool.query<PlaceRow>(`SELECT * FROM locations WHERE id = $1`, [destinationId]),
    ]);
    locationDto = locationRows[0] ? placeDto(locationRows[0]) : undefined;
    destinationDto = destinationRows[0] ? placeDto(destinationRows[0]) : undefined;
  }

  // Per-stop fare is set on the schedule itself now (see rideScheduleInputSchema),
  // not baked into the route — override each stop's fare with this
  // schedule's own value where one was set, same precedence as rides.
  if (row.stop_fares.length > 0) {
    const fareByStopId = new Map(row.stop_fares.map((f) => [f.stop_id, f.fare]));
    stops = stops.map((s) => ({ stop_id: s.stop_id, fare: fareByStopId.get(s.stop_id) ?? s.fare }));
  }

  let busPlate: string | undefined;
  let driverName: string | undefined;
  let marshalName: string | undefined;
  try {
    const bus = await fetchBusInfo(row.bus_id);
    busPlate = bus.plateNumber;
    if (bus.driverId) {
      try {
        driverName = (await fetchDriverInfo(bus.driverId)).fullName;
      } catch {
        // best-effort display info only
      }
    }
    if (bus.marshalId) {
      const marshal = await fetchMarshalInfo(bus.marshalId);
      marshalName = marshal?.fullName;
    }
  } catch {
    // best-effort display info only
  }
  return {
    id: row.id,
    bus_id: row.bus_id,
    route_id: row.route_id,
    route_name: routeName,
    location_id: locationId,
    destination_id: destinationId,
    distance_km: distanceKm,
    stops,
    fare: row.fare,
    stop_fares: row.stop_fares,
    departure_time_of_day: row.departure_time_of_day,
    duration_minutes: row.duration_minutes,
    days_of_week: row.days_of_week,
    start_date: row.start_date,
    end_date: row.end_date,
    status: row.status,
    bus_plate: busPlate,
    driver_name: driverName,
    marshal_name: marshalName,
    location: locationDto,
    destination: destinationDto,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function createRideSchedule(input: RideScheduleInput): Promise<RideScheduleDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<RideScheduleRow>(
    `INSERT INTO ride_schedules (
       bus_id, route_id, fare, stop_fares, departure_time_of_day, duration_minutes, days_of_week, start_date, end_date
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.bus_id,
      input.route_id,
      input.fare,
      JSON.stringify(input.stop_fares),
      input.departure_time_of_day,
      input.duration_minutes,
      JSON.stringify(input.days_of_week),
      input.start_date,
      input.end_date ?? null,
    ],
  );
  return toDto(rows[0]);
}

export async function listRideSchedules(): Promise<RideScheduleDto[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<RideScheduleRow>(
    `SELECT * FROM ride_schedules WHERE deleted_at IS NULL ORDER BY created_at DESC`,
  );
  return Promise.all(rows.map(toDto));
}

async function getRideScheduleRow(id: number): Promise<RideScheduleRow | null> {
  const pool = getBookingPool();
  const { rows } = await pool.query<RideScheduleRow>(
    `SELECT * FROM ride_schedules WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getRideSchedule(id: number): Promise<RideScheduleDto> {
  await ensureBookingSchema();
  const row = await getRideScheduleRow(id);
  if (!row) throw new ApiError(404, "Schedule not found");
  return toDto(row);
}

export async function updateRideSchedule(id: number, input: RideScheduleInput): Promise<RideScheduleDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<RideScheduleRow>(
    `UPDATE ride_schedules SET
       bus_id=$2, route_id=$3, fare=$4, stop_fares=$5, departure_time_of_day=$6, duration_minutes=$7,
       days_of_week=$8, start_date=$9, end_date=$10, updated_at=now()
     WHERE id=$1 AND deleted_at IS NULL
     RETURNING *`,
    [
      id,
      input.bus_id,
      input.route_id,
      input.fare,
      JSON.stringify(input.stop_fares),
      input.departure_time_of_day,
      input.duration_minutes,
      JSON.stringify(input.days_of_week),
      input.start_date,
      input.end_date ?? null,
    ],
  );
  if (!rows[0]) throw new ApiError(404, "Schedule not found");
  return toDto(rows[0]);
}

export async function updateRideScheduleStatus(id: number, status: RideScheduleStatus): Promise<RideScheduleDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<RideScheduleRow>(
    `UPDATE ride_schedules SET status=$2, updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING *`,
    [id, status],
  );
  if (!rows[0]) throw new ApiError(404, "Schedule not found");
  return toDto(rows[0]);
}

// Pausing/deleting a schedule only ever stops future generation — it never
// touches rides already generated from it. Those are edited/cancelled
// individually through the normal single-ride flows, same as any other ride.
export async function deleteRideSchedule(id: number): Promise<void> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  await pool.query(`UPDATE ride_schedules SET deleted_at = now() WHERE id = $1`, [id]);
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return dateOnly(d);
}

function dayOfWeekUTC(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

// Bare "HH:MM" has no timezone info; this backend has no date/timezone
// library dependency anywhere, so a fixed WAT (UTC+1, no DST) offset is
// used rather than introducing one — matches the ₦-priced, Lagos-area
// routes throughout this app. Revisit if that assumption is ever wrong.
const TZ_OFFSET_MINUTES = 60;

function combineDateAndTime(dateStr: string, timeOfDay: string, durationMinutes: number | null): { departureTime: Date; arrivalTime: Date | null } {
  const [hh, mm] = timeOfDay.split(":").map(Number);
  const utcMinutes = hh * 60 + mm - TZ_OFFSET_MINUTES;
  const departureTime = new Date(`${dateStr}T00:00:00Z`);
  departureTime.setUTCMinutes(departureTime.getUTCMinutes() + utcMinutes);
  const arrivalTime = durationMinutes
    ? new Date(departureTime.getTime() + durationMinutes * 60_000)
    : null;
  return { departureTime, arrivalTime };
}

async function rideExistsForScheduleOnDate(scheduleId: number, dateStr: string): Promise<boolean> {
  const pool = getBookingPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM rides WHERE schedule_id = $1 AND departure_time::date = $2 AND deleted_at IS NULL LIMIT 1`,
    [scheduleId, dateStr],
  );
  return rows.length > 0;
}

export interface GenerateRidesSummary {
  created: number;
  skipped: number;
  conflicts: number;
  errors: string[];
}

// Idempotent and safe to call repeatedly (page-load trigger, cron, or both)
// — every occurrence is checked against existing rows before creating
// anything, so calling this twice never duplicates a ride. Deliberately
// sequential (not Promise.all) across both schedules and days: this
// codebase's routes.ts documents the same Neon pool (max: 3) exhaustion
// risk, and this runs unattended, so a silent connection-pool failure here
// would be worse than in a request-scoped call.
export async function ensureScheduledRidesGenerated(): Promise<GenerateRidesSummary> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  // 30, not 7: the admin dashboard needs to see and manage a schedule's
  // trips roughly a month out (assign buses, review fares, etc.), and this
  // horizon is currently the *only* thing that limits how far ahead a ride
  // exists at all — there's no separate, narrower restriction on how far
  // out a customer can search/book. Raising it means a customer can now
  // find/book trips up to a month out too, not just admins seeing them; if
  // a shorter customer booking window is wanted, it needs its own check in
  // searchRides/bookings, not a smaller value here.
  const horizonDays = Number(process.env.RIDE_SCHEDULE_HORIZON_DAYS ?? 30);
  const today = dateOnly(new Date());

  const { rows: schedules } = await pool.query<RideScheduleRow>(
    `SELECT * FROM ride_schedules
     WHERE status = 'active' AND deleted_at IS NULL
       AND start_date <= $1 AND (end_date IS NULL OR end_date >= $1)`,
    [addDays(today, horizonDays)],
  );

  let created = 0;
  let skipped = 0;
  let conflicts = 0;
  const errors: string[] = [];

  for (const schedule of schedules) {
    for (let offset = 0; offset <= horizonDays; offset++) {
      const date = addDays(today, offset);
      if (date < schedule.start_date) continue;
      if (schedule.end_date && date > schedule.end_date) continue;
      if (!schedule.days_of_week.includes(dayOfWeekUTC(date))) continue;

      const exists = await rideExistsForScheduleOnDate(schedule.id, date);
      if (exists) {
        skipped++;
        continue;
      }

      try {
        // Driver and marshal are always read fresh from the bus here, never
        // from anything stored on the schedule — a schedule can keep
        // generating trips for weeks, and the bus's assignment can change
        // at any point in that window (see the note on rideScheduleInputSchema).
        const bus = await fetchBusInfo(schedule.bus_id);
        if (!bus.driverId) {
          throw new Error(`bus ${schedule.bus_id} has no driver assigned`);
        }
        const driver = await fetchDriverInfo(bus.driverId);
        await assertDriverAssignable(bus.driverId);
        const marshal = bus.marshalId ? await fetchMarshalInfo(bus.marshalId) : null;
        const { seatDefs, driverRow, driverCol } = seatDefsFromBusSeats(bus.seats);
        if (seatDefs.length === 0) {
          throw new Error(`bus ${schedule.bus_id} has no seats configured`);
        }
        const { departureTime, arrivalTime } = combineDateAndTime(date, schedule.departure_time_of_day, schedule.duration_minutes);

        // One-time backfill for a schedule created before route_id existed
        // — turns its old denormalized snapshot into a real, reusable route
        // and pins it going forward, so this only ever runs once per schedule.
        let routeId = schedule.route_id;
        if (!routeId) {
          const backfilled = await createRoute(
            {
              name: schedule.route_name ?? "Unknown route",
              location_id: schedule.location_id ?? 0,
              destination_id: schedule.destination_id ?? 0,
              distance_km: schedule.distance_km ?? 0,
              stops: (schedule.stops ?? []).map((s) => ({ stop_id: s.stop_id })),
              tags: [],
            },
            { createReturn: false },
          );
          routeId = backfilled.id;
          // The legacy snapshot's per-stop fares move onto this schedule's
          // own stop_fares (not the new route — routes don't carry fares
          // any more) so they aren't silently lost in the backfill.
          const legacyStopFares = (schedule.stops ?? [])
            .filter((s): s is { stop_id: number; fare: number } => s.fare != null)
            .map((s) => ({ stop_id: s.stop_id, fare: s.fare }));
          await pool.query(`UPDATE ride_schedules SET route_id = $2, stop_fares = $3 WHERE id = $1`, [
            schedule.id,
            routeId,
            JSON.stringify(legacyStopFares),
          ]);
          schedule.stop_fares = legacyStopFares;
        } else {
          const route = await getRoute(routeId);
          if (route.status !== "active") {
            throw new Error(`route ${routeId} is inactive`);
          }
        }

        await createRide({
          routeId,
          busId: schedule.bus_id,
          driverId: bus.driverId,
          driverName: driver.fullName,
          driverRating: driver.rating,
          marshalAdminId: bus.marshalId,
          marshalName: marshal?.fullName ?? null,
          busPlate: bus.plateNumber,
          busModel: bus.model,
          departureTime,
          arrivalTime,
          fare: schedule.fare,
          totalSeats: seatDefs.length,
          seatDefs,
          driverRow,
          driverCol,
          scheduleId: schedule.id,
          stopFares: schedule.stop_fares,
        });
        created++;
      } catch (err) {
        // createRide's own overlap check throws a 409 ApiError — surfaced
        // here as a distinct count, not lumped in with genuine failures
        // (a missing driver, an unseated bus), since an overlap is an
        // expected, self-resolving outcome (a manually-created ride already
        // occupies that slot) rather than something needing admin attention.
        if (err instanceof ApiError && err.status === 409) {
          conflicts++;
        } else {
          errors.push(`schedule ${schedule.id} on ${date}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  return { created, skipped, conflicts, errors };
}
