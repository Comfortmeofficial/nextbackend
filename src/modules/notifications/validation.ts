import { z } from "zod";

export { idParamSchema } from "@/lib/common-validation";

const contactFields = {
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  push_token: z.string().nullable().optional(),
};

export const otpNotificationSchema = z.object({
  user_id: z.number().int().nullable().optional(),
  email: z.string(),
  otp: z.string(),
  purpose: z.string(),
  phone: z.string().nullable().optional(),
  push_token: z.string().nullable().optional(),
});

// One entry per ride in the booking (more than one for a return trip/
// multi-day purchase) — everything the confirmation email needs to actually
// describe the trip, since a bare reference + amount previously left riders
// with a booking confirmation that said nothing about the ride itself.
const bookingLegSchema = z.object({
  location_name: z.string(),
  destination_name: z.string(),
  departure_time: z.string(),
  seat_numbers: z.array(z.string()),
  bus_plate: z.string().nullable().optional(),
  fare: z.number(),
});

export const bookingNotificationSchema = z.object({
  user_id: z.number().int(),
  booking_id: z.number().int().nullable().optional(),
  amount: z.number(),
  reference: z.string(),
  legs: z.array(bookingLegSchema).default([]),
  ...contactFields,
});

export const paymentNotificationSchema = z.object({
  user_id: z.number().int(),
  amount: z.number(),
  type: z.string(),
  reference: z.string(),
  ...contactFields,
});

export const rideReminderSchema = z.object({
  user_id: z.number().int(),
  ride_id: z.number().int(),
  departure_time: z.string(),
  ...contactFields,
});

export const rideUpdateSchema = z.object({
  user_id: z.number().int(),
  ride_id: z.number().int(),
  message: z.string(),
  ...contactFields,
});

export const waitlistNotificationSchema = z.object({
  email: z.string(),
  full_name: z.string(),
});

export const pinCreatedSchema = z.object({
  user_id: z.number().int(),
  ...contactFields,
});

export const bookingCancelledSchema = z.object({
  user_id: z.number().int(),
  reference: z.string(),
  refund_amount: z.number(),
  deduction: z.number(),
  ...contactFields,
});

export const rentalRequestReceivedSchema = z.object({
  user_id: z.number().int(),
  rental_id: z.number().int().nullable().optional(),
  pickup: z.string(),
  destination: z.string(),
  ...contactFields,
});

export const rentalPricedSchema = z.object({
  user_id: z.number().int(),
  rental_id: z.number().int().nullable().optional(),
  pickup: z.string(),
  destination: z.string(),
  amount: z.number(),
  ...contactFields,
});

export const rentalRejectedSchema = z.object({
  user_id: z.number().int(),
  rental_id: z.number().int().nullable().optional(),
  pickup: z.string(),
  destination: z.string(),
  ...contactFields,
});

export const rentalConfirmedSchema = z.object({
  user_id: z.number().int(),
  rental_id: z.number().int().nullable().optional(),
  pickup: z.string(),
  destination: z.string(),
  amount: z.number(),
  ...contactFields,
});

export const listQuerySchema = z.object({
  skip: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().default(50),
});
