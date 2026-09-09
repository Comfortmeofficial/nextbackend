import { ApiError } from "@/lib/http-errors";
import { fetchGeocode } from "../external";
import { ensureBookingSchema, getBookingPool } from "../db";
import type { PlaceDto, PlaceRow } from "../types";
import type { PlaceInput } from "../validation";

// LocationRepo/DestinationRepo/StopRepo in the source are three
// near-identical copy-pasted types differing only by table/model name and
// the "already exists" message — a legitimate case for one generic
// implementation rather than tripling this file.
export type PlaceKind = "locations" | "destinations" | "stops";

const NOT_FOUND_LABEL: Record<PlaceKind, string> = {
  locations: "Location",
  destinations: "Destination",
  stops: "Stop",
};
const CONFLICT_LABEL: Record<PlaceKind, string> = {
  locations: "Location already exists",
  destinations: "Destination already exists",
  stops: "Stop already exists",
};

function toDto(row: PlaceRow): PlaceDto {
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

// Only locations/destinations feed route distance calculation — stops don't
// need a real-world geocode, so this stays opt-in rather than automatic for
// every place kind.
export function makePlaceRepo(kind: PlaceKind, options: { geocode?: boolean } = {}) {
  const table = kind;
  const shouldGeocode = options.geocode ?? false;

  return {
    async create(input: PlaceInput): Promise<PlaceDto> {
      await ensureBookingSchema();
      const pool = getBookingPool();
      let { latitude, longitude } = input;
      if (shouldGeocode && latitude === 0 && longitude === 0) {
        const geocoded = await fetchGeocode(`${input.name}, ${input.state}`);
        if (geocoded) {
          latitude = geocoded.latitude;
          longitude = geocoded.longitude;
        }
      }
      try {
        const { rows } = await pool.query<PlaceRow>(
          `INSERT INTO ${table} (name, state, latitude, longitude) VALUES ($1, $2, $3, $4) RETURNING *`,
          [input.name, input.state, latitude, longitude],
        );
        return toDto(rows[0]);
      } catch {
        throw new ApiError(409, CONFLICT_LABEL[kind]);
      }
    },

    async list(skip: number, limit: number): Promise<PlaceDto[]> {
      await ensureBookingSchema();
      const pool = getBookingPool();
      const { rows } = await pool.query<PlaceRow>(
        `SELECT * FROM ${table} WHERE deleted_at IS NULL OFFSET $1 LIMIT $2`,
        [skip, limit],
      );
      return rows.map(toDto);
    },

    async getById(id: number): Promise<PlaceDto> {
      await ensureBookingSchema();
      const pool = getBookingPool();
      const { rows } = await pool.query<PlaceRow>(
        `SELECT * FROM ${table} WHERE id = $1 AND deleted_at IS NULL`,
        [id],
      );
      if (!rows[0]) {
        throw new ApiError(404, `${NOT_FOUND_LABEL[kind]} not found`);
      }
      return toDto(rows[0]);
    },

    async update(id: number, input: PlaceInput): Promise<PlaceDto> {
      await ensureBookingSchema();
      // Matches the source: GetByID first (so a missing row 404s cleanly),
      // then an unconditional full-row Save — every field is overwritten,
      // there's no partial-update semantics here at all.
      await this.getById(id);
      const pool = getBookingPool();
      const { rows } = await pool.query<PlaceRow>(
        `UPDATE ${table} SET name = $2, state = $3, latitude = $4, longitude = $5, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, input.name, input.state, input.latitude, input.longitude],
      );
      return toDto(rows[0]);
    },

    async delete(id: number): Promise<void> {
      await ensureBookingSchema();
      const pool = getBookingPool();
      // Matches the source: the handler ignores Delete's error and always
      // responds 204, even for a nonexistent id (a no-op DELETE affecting 0
      // rows isn't an error in GORM either).
      await pool.query(`UPDATE ${table} SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, [id]);
    },
  };
}

export const locationRepo = makePlaceRepo("locations", { geocode: true });
export const destinationRepo = makePlaceRepo("destinations", { geocode: true });
export const stopRepo = makePlaceRepo("stops");

// The admin dashboard now manages exactly one place list — Locations — and
// route creation just picks origin/destination/stops from it via search,
// instead of separately maintaining Locations/Destinations/Stops. But
// routes.destination_id and route_stops.stop_id still reference the
// destinations/stops tables directly (left in place rather than migrated,
// since the customer mobile app's GET /api/v1/destinations and
// GET /api/v1/stops read from them and must keep working unchanged). This
// bridges the two: given a locations.id, finds the destinations/stops row
// with the same name — creating a mirrored one on first use — and returns
// its id, so an admin adds a place once and it's immediately usable in any
// route role without re-entering it per table.
export async function findOrCreatePlaceIdByLocation(
  kind: "destinations" | "stops",
  locationId: number,
): Promise<number> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows: locRows } = await pool.query<PlaceRow>(
    `SELECT * FROM locations WHERE id = $1 AND deleted_at IS NULL`,
    [locationId],
  );
  const location = locRows[0];
  if (!location) {
    throw new ApiError(404, "Location not found");
  }
  const { rows: existing } = await pool.query<{ id: number }>(
    `SELECT id FROM ${kind} WHERE name = $1 AND deleted_at IS NULL`,
    [location.name],
  );
  if (existing[0]) {
    return existing[0].id;
  }
  const { rows: created } = await pool.query<{ id: number }>(
    `INSERT INTO ${kind} (name, state, latitude, longitude) VALUES ($1, $2, $3, $4) RETURNING id`,
    [location.name, location.state, location.latitude, location.longitude],
  );
  return created[0].id;
}
