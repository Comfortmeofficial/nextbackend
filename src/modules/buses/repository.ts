import { BusError } from "./errors";
import { ensureBusesSchema, getBusesPool } from "./db";
import type { BusDto, BusRow, SeatLayout } from "./types";
import type { CreateBusInput, UpdateBusInput } from "./validation";

function generateLayout(rows: number, cols: number): SeatLayout {
  const seats = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const rowLabel = String.fromCharCode("A".charCodeAt(0) + (r - 1));
      seats.push({
        seat_number: `${rowLabel}${c}`,
        row: r,
        col: c,
        is_seat: true,
        seat_type: "standard",
      });
    }
  }
  return { rows, cols, seats };
}

function layoutCapacity(layout: SeatLayout): number {
  return layout.seats.filter((s) => s.is_seat).length;
}

function toDto(row: BusRow): BusDto {
  return {
    id: Number(row.id),
    plate_number: row.plate_number,
    capacity: row.capacity,
    model: row.model,
    status: row.status as BusDto["status"],
    driver_id: row.driver_id === null ? null : Number(row.driver_id),
    layout: row.layout,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function createBus(input: CreateBusInput): Promise<BusDto> {
  await ensureBusesSchema();
  const layout =
    input.layout ??
    generateLayout(
      input.rows ?? Math.ceil((input.capacity ?? 28) / (input.cols ?? 4)),
      input.cols ?? 4,
    );
  const capacity = layoutCapacity(layout);

  const pool = getBusesPool();
  try {
    const { rows } = await pool.query<BusRow>(
      `INSERT INTO buses (plate_number, capacity, model, layout) VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.plate_number, capacity, input.model, JSON.stringify(layout)],
    );
    return toDto(rows[0]);
  } catch {
    // Mirrors the source exactly: ANY error here (unique-violation or
    // otherwise) maps to 409, not just an actual conflict.
    throw new BusError(409);
  }
}

export async function listBuses(): Promise<BusDto[]> {
  await ensureBusesSchema();
  const pool = getBusesPool();
  try {
    const { rows } = await pool.query<BusRow>(
      `SELECT * FROM buses WHERE status != 'retired' ORDER BY id`,
    );
    return rows.map(toDto);
  } catch {
    // Mirrors the source: any query failure here silently returns an empty
    // list with a 200, not an error response.
    return [];
  }
}

export async function getBus(id: number): Promise<BusDto> {
  await ensureBusesSchema();
  const pool = getBusesPool();
  let rows;
  try {
    ({ rows } = await pool.query<BusRow>(`SELECT * FROM buses WHERE id = $1`, [id]));
  } catch {
    throw new BusError(500);
  }
  // No retired-status filter here, unlike listBuses — a "deleted" (retired)
  // bus is still fully fetchable by id in the source service.
  if (!rows[0]) {
    throw new BusError(404);
  }
  return toDto(rows[0]);
}

export async function updateBus(id: number, input: UpdateBusInput): Promise<BusDto> {
  await ensureBusesSchema();
  const pool = getBusesPool();

  let existingRows;
  try {
    existingRows = (await pool.query<BusRow>(`SELECT * FROM buses WHERE id = $1`, [id])).rows;
  } catch {
    throw new BusError(500);
  }
  const existing = existingRows[0];
  if (!existing) {
    throw new BusError(404);
  }

  const newPlate = input.plate_number ?? existing.plate_number;
  const newModel = input.model ?? existing.model;
  const newStatus = input.status ?? existing.status;
  const newDriverId = input.driver_id ?? (existing.driver_id === null ? null : Number(existing.driver_id));
  const newLayout = input.layout ?? existing.layout;
  const newCapacity = layoutCapacity(newLayout);

  try {
    const { rows } = await pool.query<BusRow>(
      `UPDATE buses SET plate_number=$2, model=$3, status=$4, driver_id=$5, layout=$6, capacity=$7, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [id, newPlate, newModel, newStatus, newDriverId, JSON.stringify(newLayout), newCapacity],
    );
    return toDto(rows[0]);
  } catch {
    throw new BusError(500);
  }
}

export async function assignDriver(id: number, driverId: number): Promise<BusDto> {
  await ensureBusesSchema();
  const pool = getBusesPool();
  let rows;
  try {
    ({ rows } = await pool.query<BusRow>(
      `UPDATE buses SET driver_id=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [id, driverId],
    ));
  } catch {
    throw new BusError(500);
  }
  if (!rows[0]) {
    throw new BusError(404);
  }
  return toDto(rows[0]);
}

export async function unassignDriver(id: number): Promise<BusDto> {
  await ensureBusesSchema();
  const pool = getBusesPool();
  let rows;
  try {
    ({ rows } = await pool.query<BusRow>(
      `UPDATE buses SET driver_id=NULL, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [id],
    ));
  } catch {
    throw new BusError(500);
  }
  if (!rows[0]) {
    throw new BusError(404);
  }
  return toDto(rows[0]);
}

// Single source of truth for "this driver's current bus" — buses.driver_id.
// Used by drivers/repository.ts::toDto() instead of a separately-tracked
// (and easily stale) drivers.assigned_bus_id column.
export async function getBusIdForDriver(driverId: number): Promise<number | null> {
  await ensureBusesSchema();
  const pool = getBusesPool();
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM buses WHERE driver_id = $1 AND status != 'retired' LIMIT 1`,
    [driverId],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

export async function getBusIdsForDrivers(driverIds: number[]): Promise<Map<number, number>> {
  if (driverIds.length === 0) return new Map();
  await ensureBusesSchema();
  const pool = getBusesPool();
  const { rows } = await pool.query<{ id: number; driver_id: number }>(
    `SELECT id, driver_id FROM buses WHERE driver_id = ANY($1) AND status != 'retired'`,
    [driverIds],
  );
  return new Map(rows.map((r) => [Number(r.driver_id), Number(r.id)]));
}

export async function getBusLayout(id: number): Promise<SeatLayout> {
  await ensureBusesSchema();
  const pool = getBusesPool();
  let rows;
  try {
    ({ rows } = await pool.query<{ layout: SeatLayout }>(
      `SELECT layout FROM buses WHERE id = $1`,
      [id],
    ));
  } catch {
    throw new BusError(500);
  }
  if (!rows[0]) {
    throw new BusError(404);
  }
  return rows[0].layout;
}

export async function deleteBus(id: number): Promise<void> {
  await ensureBusesSchema();
  const pool = getBusesPool();
  let rowCount: number | null;
  try {
    ({ rowCount } = await pool.query(
      `UPDATE buses SET status='retired', updated_at=NOW() WHERE id=$1`,
      [id],
    ));
  } catch {
    throw new BusError(500);
  }
  if (!rowCount) {
    throw new BusError(404);
  }
}
