import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { getRental } from "@/modules/booking/repository/rentals";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const rental = await getRental(id);
    return NextResponse.json(rental);
  } catch (error) {
    return handleRouteError(error);
  }
}
