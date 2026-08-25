import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { requireBoardingActor } from "@/modules/booking/guard";
import { checkBoardingCode, getBookingRow, markOnBoard } from "@/modules/booking/repository/bookings";
import { parseBookingId } from "@/modules/booking/util";
import { boardingCodeInputSchema } from "@/modules/booking/validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/bookings/{id}/board — either the rider self-service (scanning
// the driver's displayed QR/OTP) or the ride's assigned marshal (scanning
// the rider's own booking QR), gated by requireBoardingActor either way.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const booking = await getBookingRow(id);
    if (!booking) throw new ApiError(404, "Booking not found");
    await requireBoardingActor(request, booking);
    const { code } = boardingCodeInputSchema.parse(await request.json());
    try {
      await checkBoardingCode(id, code);
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : String(err));
    }
    const updated = await markOnBoard(id);
    return NextResponse.json(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
