export type BusStatus = "active" | "maintenance" | "retired";

export interface SeatDefinition {
  seat_number: string;
  row: number;
  col: number;
  is_seat: boolean;
  seat_type: string;
}

// A draggable section of the layout, positioned on the designer's canvas at
// (x, y) with seats numbered locally within it (row/col start at 1 within
// the block, not globally). Purely an editing convenience — every consumer
// besides the designer itself reads the already-flattened `seats` on
// SeatLayout, computed by translating each block's local coordinates by its
// (x, y) offset at save time.
export interface SeatBlock {
  id: string;
  label?: string;
  x: number;
  y: number;
  rows: number;
  cols: number;
  seats: SeatDefinition[];
}

export interface SeatLayout {
  rows: number;
  cols: number;
  seats: SeatDefinition[];
  blocks?: SeatBlock[];
}

export interface BusRow {
  id: number;
  plate_number: string;
  capacity: number;
  model: string;
  status: string; // stored as plain lowercase text, unlike the SQLAlchemy services
  driver_id: number | null;
  bus_type: string | null;
  picture: string | null;
  insurance_document: string | null;
  // Fetched via TO_CHAR(..., 'YYYY-MM-DD') rather than letting node-postgres
  // parse DATE into a JS Date — same reasoning as drivers.license_expiry.
  insurance_incorporation_date: string | null;
  insurance_expiry_date: string | null;
  layout: SeatLayout;
  created_at: Date;
  updated_at: Date;
}

// Matches the `Bus` struct's Serialize impl in main.rs — id/driver_id are
// serialized as JSON numbers there (Rust i64) too. marshal_ids and
// current_ride_id have no equivalent in that struct — both are new, sourced
// from bus_marshals/rides rather than a column on this row. current_ride_id
// is what the admin dashboard derives its "Trip Status" (active/inactive)
// badge from, layered on top of `status` (active/maintenance/retired),
// which governs whether the bus can be used at all — same split as drivers
// and marshals.
export interface BusDto {
  id: number;
  plate_number: string;
  capacity: number;
  model: string;
  status: BusStatus;
  driver_id: number | null;
  bus_type: string | null;
  marshal_ids: number[];
  current_ride_id: number | null;
  picture: string | null;
  insurance_document: string | null;
  insurance_incorporation_date: string | null;
  insurance_expiry_date: string | null;
  layout: SeatLayout;
  created_at: string;
  updated_at: string;
}

export interface BusDocumentRow {
  id: number;
  bus_id: number;
  title: string;
  image: string;
  created_at: Date;
}

export interface BusDocumentDto {
  id: number;
  bus_id: number;
  title: string;
  image: string;
  created_at: string;
}
