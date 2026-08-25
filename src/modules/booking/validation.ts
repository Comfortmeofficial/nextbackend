import { z } from "zod";

// Gin's `binding:"required"` on a numeric field means "not the zero value"
// (0 fails validation), not just "key present" — different from a string's
// required, which just means non-empty. requiredId also folds in the uint
// type constraint: Go's JSON binder rejects a negative number into a uint
// field outright.
const requiredId = z.number().int().positive();
const requiredNonZero = z.number().refine((v) => v !== 0, { message: "required" });
const requiredPositive = z.number().positive();
const requiredString = z.string().min(1);

export const placeInputSchema = z.object({
  name: requiredString,
  state: requiredString,
  latitude: z.number().default(0),
  longitude: z.number().default(0),
});
export type PlaceInput = z.infer<typeof placeInputSchema>;

const routeStopInputSchema = z.object({
  stop_id: requiredId,
  // Explicit pickup fare for this stop — omitted/undefined means riders
  // boarding here pay the ride's base fare instead.
  fare: z.number().nonnegative().optional(),
});

export const routeInputSchema = z.object({
  name: requiredString,
  location_id: requiredId,
  destination_id: requiredId,
  distance_km: z.number().default(0),
  stops: z.array(routeStopInputSchema).default([]),
});
export type RouteInput = z.infer<typeof routeInputSchema>;

// Ride creation no longer picks an existing route — it always creates a
// fresh, ride-specific one from these fields (reusing routeInputSchema's
// shape unmodified), so admins never have to leave the ride-creation form
// to manage a separate, reusable Route entity. `total_seats` is gone too:
// the bus's own seat layout is always authoritative (see POST /rides).
export const rideInputSchema = z.object({
  route: routeInputSchema,
  bus_id: requiredId,
  driver_id: requiredId,
  departure_time: requiredString,
  arrival_time: z.string().optional(),
  fare: requiredNonZero,
});
export type RideInput = z.infer<typeof rideInputSchema>;

// A recurring ride template: the same route/bus/driver/fare shape as a
// one-off ride, plus a departure time-of-day and a day-of-week recurrence
// rule. Generates independent `rides` rows going forward — editing or
// pausing a schedule never touches rows already generated from it.
export const rideScheduleInputSchema = z.object({
  bus_id: requiredId,
  driver_id: requiredId,
  route: routeInputSchema,
  fare: requiredNonZero,
  departure_time_of_day: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM"),
  duration_minutes: z.number().int().positive().optional(),
  days_of_week: z.array(z.number().int().min(0).max(6)).min(1),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
export type RideScheduleInput = z.infer<typeof rideScheduleInputSchema>;

export const rideScheduleStatusInputSchema = z.object({ status: z.enum(["active", "paused"]) });

export const rideStatusInputSchema = z.object({ status: requiredString });
export const rideBusInputSchema = z.object({ bus_id: requiredId });
export const rideDriverInputSchema = z.object({ driver_id: requiredId });
// marshal_admin_id: null unassigns the current marshal from the ride.
export const rideMarshalInputSchema = z.object({ marshal_admin_id: requiredId.nullable() });
export const chatMessageInputSchema = z.object({ message: z.string().trim().min(1).max(2000) });

export const searchInputSchema = z.object({
  location: z.string().default(""),
  destination: requiredString,
  // Optional departure-date window (ISO date strings, e.g. "2026-08-25"),
  // inclusive of both ends — used by multi-day / date-range search so a
  // single query can cover several days at once.
  from_date: z.string().nullable().optional(),
  to_date: z.string().nullable().optional(),
});

const paymentMethodSchema = z.enum(["wallet", "debit_card", "bank_transfer"]);

export const bookingInputSchema = z.object({
  user_id: requiredId,
  ride_id: requiredId,
  seat_number: requiredString,
  amount: requiredNonZero,
  discount_amount: z.number().default(0),
  coupon_code: z.string().default(""),
  payment_method: paymentMethodSchema,
  pickup_stop_id: z.number().int().positive().nullable().optional(),
});
export type BookingInput = z.infer<typeof bookingInputSchema>;

const bulkBookingSeatInputSchema = z.object({
  seat_number: requiredString,
  amount: requiredNonZero,
  discount_amount: z.number().default(0),
});

export const bulkBookingInputSchema = z.object({
  user_id: requiredId,
  ride_id: requiredId,
  payment_method: paymentMethodSchema,
  coupon_code: z.string().default(""),
  group_reference: z.string().default(""),
  pickup_stop_id: z.number().int().positive().nullable().optional(),
  seats: z.array(bulkBookingSeatInputSchema).min(1),
});
export type BulkBookingInput = z.infer<typeof bulkBookingInputSchema>;

export const boardingCodeInputSchema = z.object({ code: requiredString });

export const rateDriverInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

const rentalPaymentMethodSchema = z.enum(["wallet", "card", "bank", ""]);

export const rentalInputSchema = z.object({
  user_id: requiredId,
  pickup: requiredString,
  destination: requiredString,
  event_type: requiredString,
  pickup_date: requiredString,
  pickup_time: requiredString,
  phone: requiredString,
  notes: z.string().default(""),
  is_round_trip: z.boolean().default(false),
  return_date: z.string().default(""),
  return_time: z.string().default(""),
  payment_method: rentalPaymentMethodSchema.default(""),
});
export type RentalInput = z.infer<typeof rentalInputSchema>;

const rentalStatusSchema = z.enum(["pending", "confirmed", "rejected", "completed", "cancelled"]);

export const rentalStatusInputSchema = z.object({
  status: rentalStatusSchema,
  payment_method: rentalPaymentMethodSchema.default(""),
});

export const rentalPriceInputSchema = z.object({ amount: requiredPositive });

export const packageInputSchema = z.object({
  ride_id: requiredId,
  sender_user_id: requiredId,
  recipient_name: requiredString,
  recipient_phone: requiredString,
  drop_off_note: z.string().default(""),
  fare_amount: requiredPositive,
});
export type PackageInput = z.infer<typeof packageInputSchema>;

export const deliverPackageInputSchema = z.object({ otp: requiredString });

export const listQuerySchema = z.object({
  skip: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().default(100),
});
