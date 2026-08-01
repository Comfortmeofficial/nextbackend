import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { createBookingsBulk } from "@/modules/booking/repository/bookings";
import { bulkBookingInputSchema } from "@/modules/booking/validation";

// POST /api/v1/bookings/bulk — books every seat in a single all-or-nothing
// transaction, so a multi-seat purchase can't end up partially booked.
export async function POST(request: NextRequest) {
  try {
    const input = bulkBookingInputSchema.parse(await request.json());
    const bookings = input.seats.map((s) => {
      const final = Math.max(0, s.amount - s.discount_amount);
      return {
        userId: input.user_id,
        rideId: input.ride_id,
        seatNumber: s.seat_number,
        amount: s.amount,
        discountAmount: s.discount_amount,
        finalAmount: final,
        couponCode: input.coupon_code,
        groupReference: input.group_reference,
        paymentMethod: input.payment_method,
      };
    });
    const result = await createBookingsBulk(bookings);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
