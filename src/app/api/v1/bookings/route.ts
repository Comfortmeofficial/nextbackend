import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { createBooking, listBookingsByUser } from "@/modules/booking/repository/bookings";
import { bookingInputSchema } from "@/modules/booking/validation";

// POST /api/v1/bookings
export async function POST(request: NextRequest) {
  try {
    const input = bookingInputSchema.parse(await request.json());
    const final = Math.max(0, input.amount - input.discount_amount);
    const booking = await createBooking({
      userId: input.user_id,
      rideId: input.ride_id,
      seatNumber: input.seat_number,
      amount: input.amount,
      discountAmount: input.discount_amount,
      finalAmount: final,
      couponCode: input.coupon_code,
      groupReference: "",
      paymentMethod: input.payment_method,
      pickupStopId: input.pickup_stop_id ?? null,
    });
    return NextResponse.json(booking, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

// GET /api/v1/bookings?user_id=&skip=0&limit=20 — the rider-facing "my
// bookings" view; user_id is required (400 if missing/zero), unlike /all.
export async function GET(request: NextRequest) {
  try {
    const userId = Number(request.nextUrl.searchParams.get("user_id") ?? "0") || 0;
    const skip = Number(request.nextUrl.searchParams.get("skip") ?? "0") || 0;
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "20") || 20;
    if (!userId) {
      throw new ApiError(400, "user_id is required");
    }
    const bookings = await listBookingsByUser(userId, skip, limit);
    return NextResponse.json(bookings);
  } catch (error) {
    return handleRouteError(error);
  }
}
