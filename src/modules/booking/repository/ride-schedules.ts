import { ApiError } from "@/lib/http-errors";
import { assertDriverAssignable } from "@/modules/drivers/repository";
import { ensureBookingSchema, getBookingPool } from "../db";
import { fetchBusInfo, fetchDriverInfo } from "../external";
import type { PlaceRow, RideScheduleDto, RideScheduleRow, RideScheduleStatus } from "../types";
import type { RideScheduleInput } from "../validation";
import { createRoute } from "./routes";
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
  const [{ rows: locationRows }, { rows: destinationRows }] = await Promise.all([
    pool.query<PlaceRow>(`SELECT * FROM locations WHERE id = $1`, [row.location_id]),
    pool.query<PlaceRow>(`SELECT * FROM destinations WHERE id = $1`, [row.destination_id]),
  ]);
  let busPlate: string | undefined;
  let driverName: string | undefined;
  try {
    const bus = await fetchBusInfo(row.bus_id);
    busPlate = bus.plateNumber;
  } catch {
    // best-effort display info only
  }
  try {
    const driver = await fetchDriverInfo(row.driver_id);
    driverName = driver.fullName;
  } catch {
    // best-effort display info only
  }
  return {
    id: row.id,
    bus_id: row.bus_id,
    driver_id: row.driver_id,
    route_name: row.route_name,
    location_id: row.location_id,
    destination_id: row.destination_id,
    distance_km: row.distance_km,
    stops: row.stops,
    fare: row.fare,
    departure_time_of_day: row.departure_time_of_day,
    duration_minutes: row.duration_minutes,
    days_of_week: row.days_of_week,
    start_date: row.start_date,
    end_date: row.end_date,
    status: row.status,
    bus_plate: busPlate,
    driver_name: driverName,
    location: locationRows[0] ? placeDto(locationRows[0]) : undefined,
    destination: destinationRows[0] ? placeDto(destinationRows[0]) : undefined,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function createRideSchedule(input: RideScheduleInput): Promise<RideScheduleDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<RideScheduleRow>(
    `INSERT INTO ride_schedules (
       bus_id, driver_id, route_name, location_id, destination_id, distance_km, stops,
       fare, departure_time_of_day, duration_minutes, days_of_week, start_date, end_date
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      input.bus_id,
      input.driver_id,
      input.route.name,
      input.route.location_id,
      input.route.destination_id,
      input.route.distance_km,
      JSON.stringify(input.route.stops.map((s) => ({ stop_id: s.stop_id, fare: s.fare ?? null }))),
      input.fare,
      input.departure_time_of_day,
      input.duration_minutes ?? null,
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
       bus_id=$2, driver_id=$3, route_name=$4, location_id=$5, destination_id=$6,
       distance_km=$7, stops=$8, fare=$9, departure_time_of_day=$10, duration_minutes=$11,
       days_of_week=$12, start_date=$13, end_date=$14, updated_at=now()
     WHERE id=$1 AND deleted_at IS NULL
     RETURNING *`,
    [
      id,
      input.bus_id,
      input.driver_id,
      input.route.name,
      input.route.location_id,
      input.route.destination_id,
      input.route.distance_km,
      JSON.stringify(input.route.stops.map((s) => ({ stop_id: s.stop_id, fare: s.fare ?? null }))),
      input.fare,
      input.departure_time_of_day,
      input.duration_minutes ?? null,
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
  const horizonDays = Number(process.env.RIDE_SCHEDULE_HORIZON_DAYS ?? 7);
  const today = dateOnly(new Date());

  const { rows: schedules } = await pool.query<RideScheduleRow>(
    `SELECT * FROM ride_schedules
     WHERE status = 'active' AND deleted_at IS NULL
       AND start_date <= $1 AND (end_date IS NULL OR end_date >= $1)`,
    [addDays(today, horizonDays)],
  );

  let created = 0;
  let skipped = 0;
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
        const driver = await fetchDriverInfo(schedule.driver_id);
        await assertDriverAssignable(schedule.driver_id);
        const bus = await fetchBusInfo(schedule.bus_id);
        const { seatDefs, driverRow, driverCol } = seatDefsFromBusSeats(bus.seats);
        if (seatDefs.length === 0) {
          throw new Error(`bus ${schedule.bus_id} has no seats configured`);
        }
        const { departureTime, arrivalTime } = combineDateAndTime(date, schedule.departure_time_of_day, schedule.duration_minutes);
        const route = await createRoute({
          name: schedule.route_name,
          location_id: schedule.location_id,
          destination_id: schedule.destination_id,
          distance_km: schedule.distance_km,
          stops: schedule.stops.map((s) => ({ stop_id: s.stop_id, fare: s.fare ?? undefined })),
        });
        await createRide({
          routeId: route.id,
          busId: schedule.bus_id,
          driverId: schedule.driver_id,
          driverName: driver.fullName,
          driverRating: driver.rating,
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
        });
        created++;
      } catch (err) {
        errors.push(`schedule ${schedule.id} on ${date}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { created, skipped, errors };
}
