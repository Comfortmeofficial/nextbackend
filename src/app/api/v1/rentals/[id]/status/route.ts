import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_OR_MARSHAL_ROLES } from "@/modules/admin/guard";
import { requireOwnerOrAdmin } from "@/modules/auth/guard";
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
    const existing = await getRentalRow(id);
    if (!existing) {
      throw new ApiError(404, "rental not found");
    }
    const actor = requireOwnerOrAdmin(request, existing.user_id, OPS_OR_MARSHAL_ROLES, "Not your rental");
    if (actor === "customer" && body.status !== "cancelled") {
      throw new ApiError(403, "You can only cancel your own rental");
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
