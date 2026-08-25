import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { requireBoardingActor } from "@/modules/booking/guard";
import { checkBoardingCode, completeBooking, getBookingRow } from "@/modules/booking/repository/bookings";
import { parseBookingId } from "@/modules/booking/util";
import { boardingCodeInputSchema } from "@/modules/booking/validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/bookings/{id}/complete — the rider-facing "Checkout" action,
// or the assigned marshal completing it on the rider's behalf. Same
// dual-actor guard as board/route.ts.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const existing = await getBookingRow(id);
    if (!existing) throw new ApiError(404, "Booking not found");
    await requireBoardingActor(request, existing);
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
