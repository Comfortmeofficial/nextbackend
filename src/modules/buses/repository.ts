import { getAdmin } from "@/modules/admin/repository";
import { getCurrentRideIdForBus, getCurrentRideIdsForBuses } from "@/modules/booking/repository/rides";
import { BusError } from "./errors";
import { ensureBusesSchema, getBusesPool } from "./db";
import type { BusDocumentDto, BusDocumentRow, BusDto, BusRow, SeatLayout } from "./types";
import type { CreateBusDocumentInput, CreateBusInput, UpdateBusInput } from "./validation";

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

function layoutCapacity(layout: SeatLayout | null | undefined): number {
  return layout?.seats?.filter((s) => s.is_seat).length ?? 0;
}

// The layout column defaults to '{}' at the DB level (see db.ts) for any row
// not written through createBus/updateBus below — a direct insert, a seed
// script. That object is truthy but missing `seats`, which silently breaks
// any consumer trusting the SeatLayout type at face value (both admin web
// app pages that render bus.layout hit exactly this before being hardened
// to check bus.layout?.seats?.length instead of just bus.layout). Collapsing
// it to null here, at the read boundary, means every caller of toDto/
// toDtoList/getBusLayout gets an honest "no layout" instead of a landmine.
function normalizeLayout(layout: SeatLayout | null | undefined): SeatLayout | null {
  return layout?.seats?.length ? layout : null;
}

// Explicit column list (rather than SELECT */RETURNING *) so the two new
// DATE columns go through TO_CHAR — letting node-postgres parse them as JS
// Dates risks the same local-midnight/timezone shift called out on
// drivers.license_expiry; a plain string sidesteps that entirely.
const SELECT_COLUMNS = `
  id, plate_number, capacity, model, status, driver_id, bus_type, picture, insurance_document,
  TO_CHAR(insurance_incorporation_date, 'YYYY-MM-DD') AS insurance_incorporation_date,
  TO_CHAR(insurance_expiry_date, 'YYYY-MM-DD') AS insurance_expiry_date,
  layout, created_at, updated_at
`;

async function toDto(row: BusRow): Promise<BusDto> {
  const [marshalIds, currentRideId] = await Promise.all([
    getMarshalIdsForBus(row.id),
    getCurrentRideIdForBus(row.id),
  ]);
  return {
    id: row.id,
    plate_number: row.plate_number,
    capacity: row.capacity,
    model: row.model,
    status: row.status as BusDto["status"],
    driver_id: row.driver_id,
    bus_type: row.bus_type,
    marshal_ids: marshalIds,
    current_ride_id: currentRideId,
    picture: row.picture,
    insurance_document: row.insurance_document,
    insurance_incorporation_date: row.insurance_incorporation_date,
    insurance_expiry_date: row.insurance_expiry_date,
    layout: normalizeLayout(row.layout),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

// Batched counterpart to toDto for list endpoints — avoids N+1 queries
// against bus_marshals/rides when rendering the full buses table.
async function toDtoList(rows: BusRow[]): Promise<BusDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [marshalIds, currentRideIds] = await Promise.all([
    getMarshalIdsForBuses(ids),
    getCurrentRideIdsForBuses(ids),
  ]);
  return rows.map((row) => ({
    id: row.id,
    plate_number: row.plate_number,
    capacity: row.capacity,
    model: row.model,
    status: row.status as BusDto["status"],
    driver_id: row.driver_id,
    bus_type: row.bus_type,
    marshal_ids: marshalIds.get(row.id) ?? [],
    current_ride_id: currentRideIds.get(row.id) ?? null,
    picture: row.picture,
    insurance_document: row.insurance_document,
    insurance_incorporation_date: row.insurance_incorporation_date,
    insurance_expiry_date: row.insurance_expiry_date,
    layout: normalizeLayout(row.layout),
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
      `INSERT INTO buses (plate_number, capacity, model, layout, bus_type) VALUES ($1, $2, $3, $4, $5) RETURNING ${SELECT_COLUMNS}`,
      [input.plate_number, capacity, input.model ?? "", JSON.stringify(layout), input.bus_type ?? null],
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
      `SELECT ${SELECT_COLUMNS} FROM buses WHERE status != 'retired' ORDER BY id`,
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
    ({ rows } = await pool.query<BusRow>(`SELECT ${SELECT_COLUMNS} FROM buses WHERE id = $1`, [id]));
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
    existingRows = (await pool.query<BusRow>(`SELECT ${SELECT_COLUMNS} FROM buses WHERE id = $1`, [id])).rows;
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
  const newBusType = input.bus_type ?? existing.bus_type;
  const newLayout = input.layout ?? existing.layout;
  const newCapacity = layoutCapacity(newLayout);
  const newPicture = input.picture ?? existing.picture;
  const newInsuranceDocument = input.insurance_document ?? existing.insurance_document;
  const newInsuranceIncorporationDate = input.insurance_incorporation_date ?? existing.insurance_incorporation_date;
  const newInsuranceExpiryDate = input.insurance_expiry_date ?? existing.insurance_expiry_date;

  try {
    const { rows } = await pool.query<BusRow>(
      `UPDATE buses SET plate_number=$2, model=$3, status=$4, driver_id=$5, layout=$6, capacity=$7,
         picture=$8, insurance_document=$9, insurance_incorporation_date=$10, insurance_expiry_date=$11,
         bus_type=$12, updated_at=NOW()
       WHERE id=$1 RETURNING ${SELECT_COLUMNS}`,
      [
        id,
        newPlate,
        newModel,
        newStatus,
        newDriverId,
        JSON.stringify(newLayout),
        newCapacity,
        newPicture,
        newInsuranceDocument,
        newInsuranceIncorporationDate,
        newInsuranceExpiryDate,
        newBusType,
      ],
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
      `UPDATE buses SET driver_id=$2, updated_at=NOW() WHERE id=$1 RETURNING ${SELECT_COLUMNS}`,
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
      `UPDATE buses SET driver_id=NULL, updated_at=NOW() WHERE id=$1 RETURNING ${SELECT_COLUMNS}`,
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

export async function getBusLayout(id: number): Promise<SeatLayout | null> {
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
  return normalizeLayout(rows[0].layout);
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

function toDocumentDto(row: BusDocumentRow): BusDocumentDto {
  return {
    id: row.id,
    bus_id: row.bus_id,
    title: row.title,
    image: row.image,
    created_at: row.created_at.toISOString(),
  };
}

export async function listBusDocuments(busId: number): Promise<BusDocumentDto[]> {
  await ensureBusesSchema();
  const pool = getBusesPool();
  const { rows } = await pool.query<BusDocumentRow>(
    `SELECT * FROM bus_documents WHERE bus_id = $1 ORDER BY created_at DESC`,
    [busId],
  );
  return rows.map(toDocumentDto);
}

export async function createBusDocument(busId: number, input: CreateBusDocumentInput): Promise<BusDocumentDto> {
  await ensureBusesSchema();
  await getBus(busId); // 404s if the bus doesn't exist
  const pool = getBusesPool();
  const { rows } = await pool.query<BusDocumentRow>(
    `INSERT INTO bus_documents (bus_id, title, image) VALUES ($1, $2, $3) RETURNING *`,
    [busId, input.title, input.image],
  );
  return toDocumentDto(rows[0]);
}

export async function deleteBusDocument(busId: number, documentId: number): Promise<void> {
  await ensureBusesSchema();
  const pool = getBusesPool();
  const { rowCount } = await pool.query(
    `DELETE FROM bus_documents WHERE id = $1 AND bus_id = $2`,
    [documentId, busId],
  );
  if (!rowCount) {
    throw new BusError(404);
  }
}
