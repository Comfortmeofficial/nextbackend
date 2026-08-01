import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { requireDriverAuth } from "@/modules/booking/guard";
import { getRideRow, setBoardingCode } from "@/modules/booking/repository/rides";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/rides/{id}/ride-code — driver-authenticated. Returns the QR
// payload + OTP fallback the driver displays for riders to self-confirm
// boarding/completion. Generated lazily on first request, cached on the ride.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const driverId = requireDriverAuth(request);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;

    const ride = await getRideRow(id);
    if (!ride) {
      throw new ApiError(404, "Ride not found");
    }
    if (ride.driver_id !== driverId) {
      throw new ApiError(403, "You are not assigned to this ride");
    }

    let code = ride.boarding_code;
    if (!code) {
      code = String(randomInt(0, 1000000)).padStart(6, "0");
      await setBoardingCode(id, code);
    }
    return NextResponse.json({ qr_payload: `CMRIDE:${id}:${code}`, otp: code });
  } catch (error) {
    return handleRouteError(error);
  }
}
