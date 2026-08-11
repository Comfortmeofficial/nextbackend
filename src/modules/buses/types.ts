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
  id: string; // BIGSERIAL — node-postgres returns int8 as a string
  plate_number: string;
  capacity: number;
  model: string;
  status: string; // stored as plain lowercase text, unlike the SQLAlchemy services
  driver_id: string | null; // BIGINT — also returned as a string
  layout: SeatLayout;
  created_at: Date;
  updated_at: Date;
}

// Matches the `Bus` struct's Serialize impl in main.rs. id/driver_id are
// serialized as JSON numbers there (Rust i64), not strings — even though
// Postgres BIGINT/BIGSERIAL round-trip through node-postgres as strings, so
// the DTO layer converts back to number to match the wire format exactly.
export interface BusDto {
  id: number;
  plate_number: string;
  capacity: number;
  model: string;
  status: BusStatus;
  driver_id: number | null;
  layout: SeatLayout;
  created_at: string;
  updated_at: string;
}
