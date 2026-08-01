export type BusStatus = "active" | "maintenance" | "retired";

export interface SeatDefinition {
  seat_number: string;
  row: number;
  col: number;
  is_seat: boolean;
  seat_type: string;
}

export interface SeatLayout {
  rows: number;
  cols: number;
  seats: SeatDefinition[];
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
