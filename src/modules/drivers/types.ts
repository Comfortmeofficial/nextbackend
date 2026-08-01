export type DriverStatusDb = "AVAILABLE" | "ASSIGNED" | "ON_TRIP" | "OFFLINE" | "ON_LEAVE" | "SUSPENDED";
export type DriverStatusApi = "available" | "assigned" | "on_trip" | "offline" | "on_leave" | "suspended";

export interface DriverRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string | null;
  emergency_contact: string | null;
  next_of_kin: string | null;
  license_number: string;
  // Fetched via TO_CHAR(..., 'YYYY-MM-DD') rather than letting node-postgres
  // parse DATE into a JS Date — pg's default DATE parsing constructs a Date
  // at local midnight, which can shift the calendar day depending on the
  // server's timezone. A plain string sidesteps that entirely.
  license_expiry: string | null;
  driver_type: string | null;
  password_hash: string;
  status: DriverStatusDb;
  verification_status: string;
  is_active: boolean;
  rating: string; // NUMERIC comes back as a string from node-postgres
  total_trips: number;
  assigned_bus_id: number | null;
  current_ride_id: number | null;
  created_at: Date;
  updated_at: Date;
}

// Matches schemas.DriverSchema
export interface DriverDto {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string | null;
  emergency_contact: string | null;
  next_of_kin: string | null;
  license_number: string;
  license_expiry: string | null;
  driver_type: string | null;
  status: DriverStatusApi;
  verification_status: string;
  rating: number;
  total_trips: number;
  assigned_bus_id: number | null;
  current_ride_id: number | null;
  created_at: string;
  updated_at: string;
}
