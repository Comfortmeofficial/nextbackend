import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { rateDriver } from "@/modules/booking/repository/bookings";
import { parseBookingId } from "@/modules/booking/util";
import { rateDriverInputSchema } from "@/modules/booking/validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/bookings/{id}/rate — the rider rating their driver after a
// completed trip. Unlike board/complete (gated only by the boarding code),
// this is user-generated content tied to identity, so it requires the
// caller's own JWT rather than trusting a user_id in the body.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const userId = requireCustomerAuth(request);
    const { rating, comment } = rateDriverInputSchema.parse(await request.json());
    const booking = await rateDriver(id, userId, rating, comment);
    return NextResponse.json(booking);
  } catch (error) {
    return handleRouteError(error);
  }
}
