import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { checkBoardingCode, markOnBoard } from "@/modules/booking/repository/bookings";
import { parseBookingId } from "@/modules/booking/util";
import { boardingCodeInputSchema } from "@/modules/booking/validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/bookings/{id}/board — rider self-service, gated on the
// ride's driver-displayed QR/OTP code.
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
    const booking = await markOnBoard(id);
    return NextResponse.json(booking);
  } catch (error) {
    return handleRouteError(error);
  }
}
