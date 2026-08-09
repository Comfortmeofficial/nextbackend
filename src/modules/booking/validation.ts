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

export const rideInputSchema = z.object({
  route_id: requiredId,
  bus_id: requiredId,
  driver_id: requiredId,
  departure_time: requiredString,
  arrival_time: z.string().optional(),
  fare: requiredNonZero,
  total_seats: requiredNonZero,
});
export type RideInput = z.infer<typeof rideInputSchema>;

export const rideStatusInputSchema = z.object({ status: requiredString });
export const rideBusInputSchema = z.object({ bus_id: requiredId });
export const rideDriverInputSchema = z.object({ driver_id: requiredId });

export const searchInputSchema = z.object({
  location: z.string().default(""),
  destination: requiredString,
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
