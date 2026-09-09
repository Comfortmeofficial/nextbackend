import { getAdmin } from "@/modules/admin/repository";
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

async function toDto(row: BusRow): Promise<BusDto> {
  return {
    id: row.id,
    plate_number: row.plate_number,
    capacity: row.capacity,
    model: row.model,
    status: row.status as BusDto["status"],
    driver_id: row.driver_id,
    marshal_ids: await getMarshalIdsForBus(row.id),
    layout: row.layout,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

// Batched counterpart to toDto for list endpoints — avoids N+1 queries
// against bus_marshals when rendering the full buses table.
async function toDtoList(rows: BusRow[]): Promise<BusDto[]> {
  if (rows.length === 0) return [];
  const marshalIds = await getMarshalIdsForBuses(rows.map((r) => r.id));
  return rows.map((row) => ({
    id: row.id,
    plate_number: row.plate_number,
    capacity: row.capacity,
    model: row.model,
    status: row.status as BusDto["status"],
    driver_id: row.driver_id,
    marshal_ids: marshalIds.get(row.id) ?? [],
    layout: row.layout,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  }));
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
    return toDtoList(rows);
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
  const newDriverId = input.driver_id ?? existing.driver_id;
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
  return rows[0] ? rows[0].id : null;
}

export async function getBusIdsForDrivers(driverIds: number[]): Promise<Map<number, number>> {
  if (driverIds.length === 0) return new Map();
  await ensureBusesSchema();
  const pool = getBusesPool();
  const { rows } = await pool.query<{ id: number; driver_id: number }>(
    `SELECT id, driver_id FROM buses WHERE driver_id = ANY($1) AND status != 'retired'`,
    [driverIds],
  );
  return new Map(rows.map((r) => [r.driver_id, r.id]));
}

export async function getMarshalIdsForBus(busId: number): Promise<number[]> {
  await ensureBusesSchema();
  const pool = getBusesPool();
  const { rows } = await pool.query<{ marshal_id: number }>(
    `SELECT marshal_id FROM bus_marshals WHERE bus_id = $1 ORDER BY marshal_id`,
    [busId],
  );
  return rows.map((r) => r.marshal_id);
}

async function getMarshalIdsForBuses(busIds: number[]): Promise<Map<number, number[]>> {
  if (busIds.length === 0) return new Map();
  await ensureBusesSchema();
  const pool = getBusesPool();
  const { rows } = await pool.query<{ bus_id: number; marshal_id: number }>(
    `SELECT bus_id, marshal_id FROM bus_marshals WHERE bus_id = ANY($1) ORDER BY marshal_id`,
    [busIds],
  );
  const map = new Map<number, number[]>();
  for (const row of rows) {
    const list = map.get(row.bus_id) ?? [];
    list.push(row.marshal_id);
    map.set(row.bus_id, list);
  }
  return map;
}

// Reverse lookup of getMarshalIdsForBus — which bus(es) a given marshal is
// on. Used by the Bus Marshals page (an "Assigned Bus" column, mirroring
// drivers' single assigned_bus_id, except a marshal can be on more than one).
export async function getBusIdsForMarshal(marshalId: number): Promise<number[]> {
  await ensureBusesSchema();
  const pool = getBusesPool();
  const { rows } = await pool.query<{ bus_id: number }>(
    `SELECT bus_id FROM bus_marshals WHERE marshal_id = $1 ORDER BY bus_id`,
    [marshalId],
  );
  return rows.map((r) => r.bus_id);
}

export async function getBusIdsForMarshals(marshalIds: number[]): Promise<Map<number, number[]>> {
  if (marshalIds.length === 0) return new Map();
  await ensureBusesSchema();
  const pool = getBusesPool();
  const { rows } = await pool.query<{ bus_id: number; marshal_id: number }>(
    `SELECT bus_id, marshal_id FROM bus_marshals WHERE marshal_id = ANY($1) ORDER BY bus_id`,
    [marshalIds],
  );
  const map = new Map<number, number[]>();
  for (const row of rows) {
    const list = map.get(row.marshal_id) ?? [];
    list.push(row.bus_id);
    map.set(row.marshal_id, list);
  }
  return map;
}

// Only an admin with the bus_marshal role can be assigned — prevents an
// ops manager or finance officer ending up in this list by accident. A
// suspended marshal can't be assigned either, mirroring assertDriverAssignable.
export async function assignMarshalToBus(busId: number, marshalId: number): Promise<BusDto> {
  await ensureBusesSchema();
  const bus = await getBus(busId);
  const marshal = await getAdmin(marshalId);
  if (!marshal || marshal.role !== "bus_marshal") {
    throw new BusError(400);
  }
  if (!marshal.is_active) {
    throw new BusError(400);
  }
  const pool = getBusesPool();
  await pool.query(
    `INSERT INTO bus_marshals (bus_id, marshal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [busId, marshalId],
  );
  return { ...bus, marshal_ids: await getMarshalIdsForBus(busId) };
}

export async function unassignMarshalFromBus(busId: number, marshalId: number): Promise<BusDto> {
  await ensureBusesSchema();
  const bus = await getBus(busId);
  const pool = getBusesPool();
  await pool.query(`DELETE FROM bus_marshals WHERE bus_id = $1 AND marshal_id = $2`, [busId, marshalId]);
  return { ...bus, marshal_ids: await getMarshalIdsForBus(busId) };
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
