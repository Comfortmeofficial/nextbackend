import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { notifyRentalEvent } from "@/modules/booking/external";
import { getRentalRow, updateRentalPrice } from "@/modules/booking/repository/rentals";
import { parseBookingId } from "@/modules/booking/util";
import { rentalPriceInputSchema } from "@/modules/booking/validation";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/v1/rentals/{id}/price — how an admin approves a pending rental
// request with a quoted price; the only way a rental reaches
// "awaiting_payment". Only valid from "pending".
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const { amount } = rentalPriceInputSchema.parse(await request.json());

    const existing = await getRentalRow(id);
    if (!existing) {
      throw new ApiError(404, "rental not found");
    }
    if (existing.status !== "pending") {
      throw new ApiError(400, "rental is not awaiting review");
    }

    const rental = await updateRentalPrice(id, amount);
    const updated = await getRentalRow(id);
    if (updated) await notifyRentalEvent(updated, "priced");
    return NextResponse.json(rental);
  } catch (error) {
    return handleRouteError(error);
  }
}
