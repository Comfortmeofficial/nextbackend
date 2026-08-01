import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { listBookingsByGroup } from "@/modules/booking/repository/bookings";

type Params = { params: Promise<{ reference: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { reference } = await params;
    const bookings = await listBookingsByGroup(reference);
    return NextResponse.json(bookings);
  } catch (error) {
    return handleRouteError(error);
  }
}
