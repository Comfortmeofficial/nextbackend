import { getAdmin } from "@/modules/admin/repository";
import { ensureBookingSchema, getBookingPool } from "../db";
import type { TripIssueDto, TripIssueRow, TripIssueCategory } from "../types";

async function toDto(row: TripIssueRow): Promise<TripIssueDto> {
  const admin = await getAdmin(row.reported_by_admin_id);
  return {
    id: row.id,
    ride_id: row.ride_id,
    reported_by_admin_id: row.reported_by_admin_id,
    reported_by_name: admin ? `${admin.first_name} ${admin.last_name}`.trim() : "Unknown",
    category: row.category,
    description: row.description,
    created_at: row.created_at.toISOString(),
  };
}

export async function createTripIssue(input: {
  ride_id: number;
  reported_by_admin_id: number;
  category: TripIssueCategory;
  description: string;
}): Promise<TripIssueDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<TripIssueRow>(
    `INSERT INTO trip_issues (ride_id, reported_by_admin_id, category, description)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.ride_id, input.reported_by_admin_id, input.category, input.description],
  );
  return toDto(rows[0]);
}

export async function listTripIssuesForRide(rideId: number): Promise<TripIssueDto[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<TripIssueRow>(
    `SELECT * FROM trip_issues WHERE ride_id = $1 ORDER BY created_at DESC`,
    [rideId],
  );
  return Promise.all(rows.map(toDto));
}
