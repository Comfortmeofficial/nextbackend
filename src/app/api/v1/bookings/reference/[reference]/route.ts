import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { getBookingByReference } from "@/modules/booking/repository/bookings";

type Params = { params: Promise<{ reference: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { reference } = await params;
    const booking = await getBookingByReference(reference);
    return NextResponse.json(booking);
  } catch (error) {
    return handleRouteError(error);
  }
}
