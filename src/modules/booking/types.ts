// Field names mirror the Go structs' json tags exactly. DOUBLE PRECISION
// columns (fare, amount, lat/lng, distance) come back from node-postgres as
// native JS numbers already — unlike the NUMERIC columns used elsewhere in
// this app, no parseFloat layer is needed here.

export interface PlaceRow {
  id: number;
  name: string;
  state: string;
  latitude: number;
  longitude: number;
  created_at: Date;
  updated_at: Date;
}

export interface PlaceDto {
  id: number;
  name: string;
  state: string;
  latitude: number;
  longitude: number;
  created_at: string;
  updated_at: string;
}

export interface RouteRow {
  id: number;
  name: string;
  location_id: number;
  destination_id: number;
  distance: number;
  estimated_duration_minutes: number | null;
  google_distance_km: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface RouteStopDto {
  id: number;
  route_id: number;
  stop_id: number;
  stop_order: number;
  // Explicit pickup fare for boarding at this stop instead of the route's
  // main location — null means "use the ride's base fare."
  fare: number | null;
  stop: PlaceDto;
}

export interface RouteDto {
  id: number;
  name: string;
  location_id: number;
  destination_id: number;
  distance_km: number;
  estimated_duration_minutes?: number;
  google_distance_km?: number;
  location: PlaceDto;
  destination: PlaceDto;
  stops: RouteStopDto[];
  created_at: string;
  updated_at: string;
}

export type RideStatus = "scheduled" | "boarding" | "active" | "completed" | "cancelled";
export const VALID_RIDE_STATUSES: RideStatus[] = [
  "scheduled",
  "boarding",
  "active",
  "completed",
  "cancelled",
];

export interface RideRow {
  id: number;
  route_id: number;
  bus_id: number;
  driver_id: number;
  driver_name: string;
  driver_rating: number;
  bus_plate: string;
  bus_model: string;
  departure_time: Date;
  arrival_time: Date | null;
  fare: number;
  total_seats: number;
  booked_seats: number;
  status: RideStatus;
  boarding_code: string;
  marshal_admin_id: number | null;
  marshal_name: string | null;
  driver_row: number | null;
  driver_col: number | null;
  schedule_id: number | null;
  created_at: Date;
  updated_at: Date;
}

export type SeatStatus = "available" | "booked";

export interface RideSeatRow {
  id: number;
  ride_id: number;
  seat_number: string;
  row: number;
  col: number;
  seat_type: string;
  status: SeatStatus;
  booking_id: number | null;
}

export interface RideSeatDto {
  id: number;
  ride_id: number;
  seat_number: string;
  row: number;
  col: number;
  seat_type: string;
  status: SeatStatus;
  booking_id?: number;
}

// `seats` is omitted entirely (not even null) on list/search results — the
// source's ListRides/Search queries never preload it (Go's omitempty on a
// nil slice drops the key), only GetRide does.
export interface RideDto {
  id: number;
  route_id: number;
  bus_id: number;
  driver_id: number;
  driver_name: string;
  driver_rating: number;
  bus_plate: string;
  bus_model: string;
  departure_time: string;
  arrival_time: string | null;
  fare: number;
  total_seats: number;
  booked_seats: number;
  status: RideStatus;
  route: RouteDto;
  seats?: RideSeatDto[];
  marshal_admin_id: number | null;
  marshal_name: string | null;
  driver_row: number | null;
  driver_col: number | null;
  schedule_id: number | null;
  created_at: string;
  updated_at: string;
}

export type RideScheduleStatus = "active" | "paused";

export interface RideScheduleRow {
  id: number;
  bus_id: number;
  driver_id: number;
  route_name: string;
  location_id: number;
  destination_id: number;
  distance_km: number;
  stops: { stop_id: number; fare: number | null }[];
  fare: number;
  departure_time_of_day: string;
  duration_minutes: number | null;
  days_of_week: number[];
  start_date: string;
  end_date: string | null;
  status: RideScheduleStatus;
  created_at: Date;
  updated_at: Date;
}

export interface RideScheduleDto {
  id: number;
  bus_id: number;
  driver_id: number;
  route_name: string;
  location_id: number;
  destination_id: number;
  distance_km: number;
  stops: { stop_id: number; fare: number | null }[];
  fare: number;
  departure_time_of_day: string;
  duration_minutes: number | null;
  days_of_week: number[];
  start_date: string;
  end_date: string | null;
  status: RideScheduleStatus;
  bus_plate?: string;
  driver_name?: string;
  location?: PlaceDto;
  destination?: PlaceDto;
  created_at: string;
  updated_at: string;
}

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed";
export type PaymentMethod = "wallet" | "debit_card" | "bank_transfer";

export interface BookingRow {
  id: number;
  reference: string;
  group_reference: string;
  user_id: number;
  ride_id: number;
  seat_number: string;
  amount: number;
  discount_amount: number;
  final_amount: number;
  coupon_code: string;
  payment_method: PaymentMethod;
  status: BookingStatus;
  is_on_board: boolean;
  pickup_stop_id: number | null;
  rating: number | null;
  rating_comment: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface BookingDto {
  id: number;
  reference: string;
  group_reference: string;
  user_id: number;
  ride_id: number;
  seat_number: string;
  amount: number;
  discount_amount: number;
  final_amount: number;
  coupon_code: string;
  payment_method: PaymentMethod;
  status: BookingStatus;
  is_on_board: boolean;
  pickup_stop_id: number | null;
  rating: number | null;
  rating_comment: string | null;
  ride: RideDto;
  created_at: string;
  updated_at: string;
}

export type ChatSenderType = "customer" | "marshal";

export interface ChatMessageRow {
  id: number;
  ride_id: number;
  user_id: number;
  sender_type: ChatSenderType;
  message: string;
  created_at: Date;
}

export interface ChatMessageDto {
  id: number;
  ride_id: number;
  user_id: number;
  sender_type: ChatSenderType;
  message: string;
  created_at: string;
}

export interface PassengerDto {
  booking_id: number;
  reference: string;
  seat_number: string;
  status: BookingStatus;
  is_on_board: boolean;
  pickup_stop_id: number | null;
  user_id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string;
}

export type RentalStatus =
  | "pending"
  | "awaiting_payment"
  | "confirmed"
  | "rejected"
  | "completed"
  | "cancelled";
export const VALID_RENTAL_STATUSES: RentalStatus[] = [
  "pending",
  "confirmed",
  "rejected",
  "completed",
  "cancelled",
];
export type RentalPaymentMethod = "wallet" | "card" | "bank" | "";

export interface RentalRow {
  id: number;
  user_id: number;
  pickup: string;
  destination: string;
  event_type: string;
  pickup_date: string;
  pickup_time: string;
  phone: string;
  notes: string;
  is_round_trip: boolean;
  return_date: string;
  return_time: string;
  passenger_count: number | null;
  duration: string | null;
  amount: number;
  payment_method: RentalPaymentMethod;
  status: RentalStatus;
  created_at: Date;
  updated_at: Date;
}

export interface RentalDto {
  id: number;
  user_id: number;
  pickup: string;
  destination: string;
  event_type: string;
  pickup_date: string;
  pickup_time: string;
  phone: string;
  notes: string;
  is_round_trip: boolean;
  return_date: string;
  return_time: string;
  passenger_count: number | null;
  duration: string | null;
  amount: number;
  payment_method: RentalPaymentMethod;
  status: RentalStatus;
  created_at: string;
  updated_at: string;
}

export type PackageStatus = "pending_pickup" | "in_transit" | "delivered" | "cancelled";
export const VALID_PACKAGE_STATUSES: PackageStatus[] = [
  "pending_pickup",
  "in_transit",
  "delivered",
  "cancelled",
];

export interface PackageRow {
  id: number;
  order_id: string;
  ride_id: number;
  sender_user_id: number;
  recipient_name: string;
  recipient_phone: string;
  drop_off_note: string;
  fare_amount: number;
  delivery_otp: string;
  status: PackageStatus;
  created_at: Date;
  updated_at: Date;
}

// delivery_otp is omitted entirely when empty (Go's omitempty on a string),
// which is how it's scrubbed from driver-facing list/deliver responses.
export interface PackageDto {
  id: number;
  order_id: string;
  ride_id: number;
  sender_user_id: number;
  recipient_name: string;
  recipient_phone: string;
  drop_off_note: string;
  fare_amount: number;
  delivery_otp?: string;
  status: PackageStatus;
  ride: RideDto;
  created_at: string;
  updated_at: string;
}
