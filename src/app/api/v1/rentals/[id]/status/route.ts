import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { notifyRentalEvent } from "@/modules/booking/external";
import { getRentalRow, updateRentalStatus } from "@/modules/booking/repository/rentals";
import { parseBookingId } from "@/modules/booking/util";
import { rentalStatusInputSchema } from "@/modules/booking/validation";
import { VALID_RENTAL_STATUSES } from "@/modules/booking/types";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const body = rentalStatusInputSchema.parse(await request.json());
    if (!VALID_RENTAL_STATUSES.includes(body.status as (typeof VALID_RENTAL_STATUSES)[number])) {
      throw new ApiError(400, `invalid rental status: ${body.status}`);
    }
    const rental = await updateRentalStatus(
      id,
      body.status as (typeof VALID_RENTAL_STATUSES)[number],
      body.payment_method || undefined,
    );
    if (body.status === "rejected") {
      // Awaited, not fire-and-forget: the source calls this as an ordinary
      // blocking function (Go has no async/await) before responding, so the
      // request genuinely waits on the notify attempt — it just never fails
      // because of it (notifyRentalEvent swallows its own errors).
      const row = await getRentalRow(id);
      if (row) await notifyRentalEvent(row, "rejected");
    }
    return NextResponse.json(rental);
  } catch (error) {
    return handleRouteError(error);
  }
}
