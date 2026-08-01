import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { checkBoardingCode, completeBooking } from "@/modules/booking/repository/bookings";
import { parseBookingId } from "@/modules/booking/util";
import { boardingCodeInputSchema } from "@/modules/booking/validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/bookings/{id}/complete — the rider-facing "Checkout" action.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const { code } = boardingCodeInputSchema.parse(await request.json());
    try {
      await checkBoardingCode(id, code);
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : String(err));
    }
    const booking = await completeBooking(id);
    return NextResponse.json(booking);
  } catch (error) {
    return handleRouteError(error);
  }
}
