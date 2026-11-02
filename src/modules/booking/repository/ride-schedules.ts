import { ApiError } from "@/lib/http-errors";
import { assertDriverAssignable } from "@/modules/drivers/repository";
import { sendRideUpdate } from "@/modules/notifications/service";
import { getUser } from "@/modules/users/repository";
import { ensureBookingSchema, getBookingPool } from "../db";
import { fetchBusInfo, fetchDriverInfo, fetchMarshalInfo } from "../external";
import type { PlaceRow, RideRow, RideScheduleDto, RideScheduleRow, RideScheduleStatus } from "../types";
import type { RideScheduleInput } from "../validation";
import { listPassengersForRide } from "./bookings";
import { createRoute, getRoute, loadFullRoute } from "./routes";
import { createRide, type SeatDef, seatDefsFromBusSeats, updateRideStatus } from "./rides";

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

  const route = row.route_id ? await loadFullRoute(row.route_id, true) : null;
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

interface NewBusContext {
  busId: number;
  plate: string;
  model: string;
  driverId: number;
  driverName: string;
  driverRating: number;
  marshalAdminId: number | null;
  marshalName: string | null;
  seatDefs: SeatDef[];
  driverRow: number | null;
  driverCol: number | null;
}

// Resolved up front, before the schedule row (or any ride) is touched, so
// a bad new-bus assignment (no driver, no seats configured, driver not
// assignable) fails loudly instead of leaving the schedule saved with
// rides it then couldn't actually propagate the bus change to.
async function resolveNewBusContext(busId: number): Promise<NewBusContext> {
  const bus = await fetchBusInfo(busId);
  if (!bus.driverId) throw new ApiError(400, `bus ${busId} has no driver assigned`);
  await assertDriverAssignable(bus.driverId);
  const driver = await fetchDriverInfo(bus.driverId);
  const marshal = bus.marshalId ? await fetchMarshalInfo(bus.marshalId) : null;
  const { seatDefs, driverRow, driverCol } = seatDefsFromBusSeats(bus.seats);
  if (seatDefs.length === 0) throw new ApiError(400, `bus ${busId} has no seats configured`);
  return {
    busId,
    plate: bus.plateNumber,
    model: bus.model,
    driverId: bus.driverId,
    driverName: driver.fullName,
    driverRating: driver.rating,
    marshalAdminId: bus.marshalId,
    marshalName: marshal?.fullName ?? null,
    seatDefs,
    driverRow,
    driverCol,
  };
}

// A ride is only ever a one-time snapshot taken at generation — editing a
// schedule afterward used to never reach rides it had already generated,
// so a passenger's ticket kept showing a stale departure time/fare/route/
// bus forever. This pushes the schedule's new values onto every upcoming
// (not yet departed, still 'scheduled') ride it has already generated.
//
// Route and bus are only ever changed on a ride with zero bookings — same
// boundary resyncRideSeatsForBus already uses for the identical reason: a
// different bus can have a different seat layout than what's already
// sold, and a different route can drop a stop an existing booking's
// pickup/drop-off already points at. A booked ride keeps its original
// route/bus even though the schedule's own changed, but still gets any
// time/fare change — and, since it has a real passenger on it, a
// notification about whatever changed.
async function propagateScheduleUpdate(
  scheduleId: number,
  after: RideScheduleRow,
  newBus: NewBusContext | null,
): Promise<void> {
  const pool = getBookingPool();
  const { rows: rides } = await pool.query<RideRow>(
    `SELECT * FROM rides
     WHERE schedule_id = $1 AND deleted_at IS NULL AND status = 'scheduled' AND departure_time > now()`,
    [scheduleId],
  );
  if (rides.length === 0) return;

  for (const ride of rides) {
    const canChangeRouteOrBus = ride.booked_seats === 0;
    const { departureTime, arrivalTime } = combineDateAndTime(
      dateOnly(ride.departure_time),
      after.departure_time_of_day,
      after.duration_minutes,
    );
    const timeOrFareChanged =
      departureTime.getTime() !== ride.departure_time.getTime() ||
      (arrivalTime?.getTime() ?? null) !== (ride.arrival_time?.getTime() ?? null) ||
      ride.fare !== after.fare;

    const routeId = canChangeRouteOrBus ? after.route_id : ride.route_id;
    // Only apply the schedule's new stop_fares when this ride actually
    // ends up on the route they were validated against (routeId ===
    // after.route_id) — otherwise (a booked ride stuck on its old route)
    // they'd reference stop ids that may not even exist on that route,
    // so this ride keeps its own existing stop_fares instead.
    const stopFares = routeId === after.route_id ? after.stop_fares : ride.stop_fares;
    let busId = ride.bus_id;
    let busPlate = ride.bus_plate;
    let busModel = ride.bus_model;
    let driverId = ride.driver_id;
    let driverName = ride.driver_name;
    let driverRating = ride.driver_rating;
    let marshalAdminId = ride.marshal_admin_id;
    let marshalName = ride.marshal_name;
    let totalSeats = ride.total_seats;
    let driverRow = ride.driver_row;
    let driverCol = ride.driver_col;
    let reseat: SeatDef[] | null = null;

    if (canChangeRouteOrBus && newBus) {
      busId = newBus.busId;
      busPlate = newBus.plate;
      busModel = newBus.model;
      driverId = newBus.driverId;
      driverName = newBus.driverName;
      driverRating = newBus.driverRating;
      marshalAdminId = newBus.marshalAdminId;
      marshalName = newBus.marshalName;
      totalSeats = newBus.seatDefs.length;
      driverRow = newBus.driverRow;
      driverCol = newBus.driverCol;
      reseat = newBus.seatDefs;
    }

    await pool.query(
      `UPDATE rides SET
         departure_time = $2, arrival_time = $3, fare = $4, stop_fares = $5::jsonb,
         route_id = $6, bus_id = $7, bus_plate = $8, bus_model = $9,
         driver_id = $10, driver_name = $11, driver_rating = $12,
         marshal_admin_id = $13, marshal_name = $14,
         total_seats = $15, driver_row = $16, driver_col = $17,
         updated_at = now()
       WHERE id = $1`,
      [
        ride.id,
        departureTime,
        arrivalTime,
        after.fare,
        JSON.stringify(stopFares),
        routeId,
        busId,
        busPlate,
        busModel,
        driverId,
        driverName,
        driverRating,
        marshalAdminId,
        marshalName,
        totalSeats,
        driverRow,
        driverCol,
      ],
    );

    if (reseat) {
      await pool.query(`DELETE FROM ride_seats WHERE ride_id = $1`, [ride.id]);
      for (const seat of reseat) {
        await pool.query(
          `INSERT INTO ride_seats (ride_id, seat_number, "row", col, seat_type, status)
           VALUES ($1, $2, $3, $4, $5, 'available')`,
          [ride.id, seat.seat_number, seat.row, seat.col, seat.seat_type],
        );
      }
    }

    // Route/bus only ever change on an unbooked ride (no passengers to
    // alert), so a notification is only ever about the time/fare change a
    // booked ride does still receive.
    if (ride.booked_seats > 0 && timeOrFareChanged) {
      await notifyPassengersOfScheduleChange(ride.id, after.departure_time_of_day, ride.fare !== after.fare);
    }
  }
}

async function notifyPassengersOfScheduleChange(
  rideId: number,
  newTimeOfDay: string,
  fareChanged: boolean,
): Promise<void> {
  const passengers = await listPassengersForRide(rideId);
  const notified = new Set<number>();
  const message =
    `Your trip's departure time has been updated to ${newTimeOfDay}` +
    (fareChanged ? ", and its fare has changed" : "") +
    ". Check the app for the latest details.";

  for (const p of passengers) {
    if (notified.has(p.user_id)) continue;
    notified.add(p.user_id);
    try {
      const user = await getUser(p.user_id);
      if (!user) continue;
      await sendRideUpdate({
        user_id: p.user_id,
        ride_id: rideId,
        message,
        phone: user.phone,
        email: user.email,
        push_token: user.push_notifications_enabled ? user.push_token : null,
      });
    } catch {
      // Best-effort, same as every other notification fan-out in this
      // codebase (see notifyRentalEvent) — one passenger's bad contact
      // info must never block the schedule update or the next passenger.
    }
  }
}

export async function updateRideSchedule(id: number, input: RideScheduleInput): Promise<RideScheduleDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const before = await getRideScheduleRow(id);
  if (!before) throw new ApiError(404, "Schedule not found");

  const newBus = input.bus_id !== before.bus_id ? await resolveNewBusContext(input.bus_id) : null;

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
  const after = rows[0];

  await propagateScheduleUpdate(id, after, newBus);

  return toDto(after);
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

// Pausing/deleting a schedule stops future generation AND removes whichever
// of its already-generated upcoming rides nobody has booked yet — those
// only exist because the schedule created them, so there's no reason to
// leave them bookable once it's gone. A ride with a live (non-cancelled)
// booking on it is deliberately left untouched: cancelling someone's
// already-paid trip needs a refund + notification this bulk path doesn't
// do, so that's left to an admin handling it individually, same as any
// other ride cancellation.
export async function deleteRideSchedule(id: number): Promise<void> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  await pool.query(`UPDATE ride_schedules SET deleted_at = now() WHERE id = $1`, [id]);

  const { rows } = await pool.query<{ id: number }>(
    `SELECT rides.id FROM rides
     WHERE rides.schedule_id = $1
       AND rides.deleted_at IS NULL
       AND rides.status = 'scheduled'
       AND rides.departure_time > now()
       AND NOT EXISTS (
         SELECT 1 FROM bookings
         WHERE bookings.ride_id = rides.id
           AND bookings.deleted_at IS NULL
           AND bookings.status != 'cancelled'
       )`,
    [id],
  );

  // Sequential, not Promise.all — same connection-pool-exhaustion reasoning
  // as getExistingRideDatesForSchedule below; a schedule rarely has more
  // than a handful of unbooked upcoming rides at once.
  for (const row of rows) {
    await updateRideStatus(row.id, "cancelled");
    await pool.query(`UPDATE rides SET deleted_at = now() WHERE id = $1`, [row.id]);
  }
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return dateOnly(d);
}

function daysBetween(fromDateStr: string, toDateStr: string): number {
  const from = new Date(`${fromDateStr}T00:00:00Z`);
  const to = new Date(`${toDateStr}T00:00:00Z`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
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

// One query per schedule instead of one per (schedule, day) — with
// end_date-respecting generation now walking up to a year for a single
// schedule, a per-day existence check was a query-per-day that added up to
// enough sequential round-trips (this loop is deliberately sequential, not
// parallel — see the note above ensureScheduledRidesGenerated) to risk
// blowing the serverless function's execution time budget.
async function getExistingRideDatesForSchedule(scheduleId: number): Promise<Set<string>> {
  const pool = getBookingPool();
  const { rows } = await pool.query<{ date: string }>(
    `SELECT DISTINCT departure_time::date::text AS date FROM rides WHERE schedule_id = $1 AND deleted_at IS NULL`,
    [scheduleId],
  );
  return new Set(rows.map((r) => r.date));
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
  // Rolling window for a schedule with no end_date (recurs indefinitely) —
  // there's no natural stopping point for those, so this is the *only*
  // thing that limits how far ahead a ride exists for them. A schedule
  // that *does* have an end_date instead generates all the way to that
  // date (see scheduleHorizonDays below), capped at maxHorizonDays so one
  // run can't be asked to materialize years of rides at once. Note this is
  // currently the only throttle on how far ahead a ride exists at all —
  // there's no separate, narrower restriction on how far out a customer
  // can search/book. A dedicated shorter customer booking window (if still
  // wanted) needs its own check in searchRides/bookings, not a smaller
  // value here.
  const horizonDays = Number(process.env.RIDE_SCHEDULE_HORIZON_DAYS ?? 30);
  const maxHorizonDays = Number(process.env.RIDE_SCHEDULE_MAX_HORIZON_DAYS ?? 365);
  const today = dateOnly(new Date());
  const furthestPossibleDate = addDays(today, maxHorizonDays);

  // Previously used a single param for both bounds ($1 = today+horizonDays
  // for *both* "hasn't started yet" and "hasn't already ended" checks) —
  // that second use was backwards: it excluded any schedule ending sooner
  // than the horizon from generation entirely, rather than just capping how
  // far ahead it generates. Two separate bounds now: a schedule is in scope
  // if it starts before the furthest we'd ever generate, and hasn't already
  // fully ended as of today.
  const { rows: rawSchedules } = await pool.query<RideScheduleRow>(
    `SELECT * FROM ride_schedules
     WHERE status = 'active' AND deleted_at IS NULL
       AND start_date <= $1 AND (end_date IS NULL OR end_date >= $2)`,
    [furthestPossibleDate, today],
  );
  // node-postgres parses a DATE column into a JS Date object, not the plain
  // "YYYY-MM-DD" string RideScheduleRow's type claims — every string
  // comparison below (and daysBetween's template-literal date parsing) was
  // silently comparing a real date string against a Date object's
  // .toString(), which is never equal/ordered the way it looks like it
  // should be. Normalize once, right here, so everything downstream in
  // this function can trust start_date/end_date really are strings.
  const schedules = rawSchedules.map((s) => ({
    ...s,
    start_date: dateOnly(new Date(s.start_date)),
    end_date: s.end_date ? dateOnly(new Date(s.end_date)) : null,
  }));

  let created = 0;
  let skipped = 0;
  let conflicts = 0;
  const errors: string[] = [];

  for (const schedule of schedules) {
    const scheduleHorizonDays = schedule.end_date
      ? Math.min(maxHorizonDays, Math.max(0, daysBetween(today, schedule.end_date)))
      : horizonDays;
    const existingDates = await getExistingRideDatesForSchedule(schedule.id);
    for (let offset = 0; offset <= scheduleHorizonDays; offset++) {
      const date = addDays(today, offset);
      if (date < schedule.start_date) continue;
      if (schedule.end_date && date > schedule.end_date) continue;
      if (!schedule.days_of_week.includes(dayOfWeekUTC(date))) continue;

      if (existingDates.has(date)) {
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
