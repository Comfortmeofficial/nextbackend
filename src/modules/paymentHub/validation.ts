import { z } from "zod";

// PaymentMethod here is payment_hub's own enum — distinct from both
// booking's Rental.PaymentMethod ("wallet"|"card"|"bank") and card_service's
// concept of a card. See helpers.ts's RENTAL_PAYMENT_METHOD for the mapping
// where it matters.
export const paymentMethodSchema = z.enum(["wallet", "debit_card", "bank_transfer"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

// Matches schemas.AddCardRequest
export const addCardRequestSchema = z.object({
  user_id: z.number().int(),
  email: z.string(),
  callback_url: z.string().nullable().optional(),
});
export type AddCardRequestInput = z.infer<typeof addCardRequestSchema>;

// Matches schemas.FundWalletRequest
export const fundWalletRequestSchema = z.object({
  user_id: z.number().int(),
  email: z.string(),
  amount: z.number(),
  payment_method: paymentMethodSchema.default("debit_card"),
  authorization_code: z.string().nullable().optional(),
  callback_url: z.string().nullable().optional(),
});
export type FundWalletRequestInput = z.infer<typeof fundWalletRequestSchema>;

// Matches schemas.RequestRentalRequest
export const requestRentalRequestSchema = z.object({
  user_id: z.number().int(),
  email: z.string(),
  pickup: z.string(),
  destination: z.string(),
  event_type: z.string(),
  pickup_date: z.string(),
  pickup_time: z.string(),
  phone: z.string(),
  notes: z.string().nullable().optional(),
  is_round_trip: z.boolean().default(false),
  return_date: z.string().nullable().optional(),
  return_time: z.string().nullable().optional(),
  passenger_count: z.number().int().positive().nullable().optional(),
  duration: z.string().nullable().optional(),
});
export type RequestRentalRequestInput = z.infer<typeof requestRentalRequestSchema>;

// Matches schemas.PayRentalRequest
export const payRentalRequestSchema = z.object({
  rental_id: z.number().int(),
  user_id: z.number().int(),
  email: z.string(),
  payment_method: paymentMethodSchema,
  wallet_pin: z.string().nullable().optional(),
  callback_url: z.string().nullable().optional(),
});
export type PayRentalRequestInput = z.infer<typeof payRentalRequestSchema>;

// One ride + the seats being booked on it. `legs` lets a single payment
// cover bookings across multiple different rides (a return trip, or a
// multi-day itinerary) — see the `legs`-aware handling in payBooking().
export const bookingLegSchema = z.object({
  ride_id: z.number().int(),
  seat_numbers: z.array(z.string()).min(1),
  pickup_stop_id: z.number().int().positive().nullable().optional(),
});
export type BookingLegInput = z.infer<typeof bookingLegSchema>;

// Matches schemas.PayBookingRequest. `ride_id`/`seat_numbers` are the
// original single-ride shape and stay valid on their own; `legs`, when
// present, takes precedence and lets one payment span multiple rides.
export const payBookingRequestSchema = z
  .object({
    user_id: z.number().int(),
    email: z.string(),
    ride_id: z.number().int().optional(),
    seat_numbers: z.array(z.string()).optional(),
    pickup_stop_id: z.number().int().positive().nullable().optional(),
    legs: z.array(bookingLegSchema).min(1).optional(),
    amount: z.number(),
    payment_method: paymentMethodSchema,
    wallet_pin: z.string().nullable().optional(),
    coupon_code: z.string().nullable().optional(),
    authorization_code: z.string().nullable().optional(),
    callback_url: z.string().nullable().optional(),
  })
  .refine((d) => (d.legs?.length ?? 0) > 0 || (d.ride_id != null && (d.seat_numbers?.length ?? 0) > 0), {
    message: "Either legs[] or ride_id + seat_numbers is required",
  });
export type PayBookingRequestInput = z.infer<typeof payBookingRequestSchema>;

// Matches schemas.PayPackageRequest
export const payPackageRequestSchema = z.object({
  sender_user_id: z.number().int(),
  email: z.string(),
  ride_id: z.number().int(),
  recipient_name: z.string(),
  recipient_phone: z.string(),
  drop_off_note: z.string().nullable().optional(),
  amount: z.number(),
  payment_method: paymentMethodSchema,
  wallet_pin: z.string().nullable().optional(),
  authorization_code: z.string().nullable().optional(),
  callback_url: z.string().nullable().optional(),
});
export type PayPackageRequestInput = z.infer<typeof payPackageRequestSchema>;
