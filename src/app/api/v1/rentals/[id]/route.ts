import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_OR_MARSHAL_ROLES } from "@/modules/admin/guard";
import { requireOwnerOrAdmin } from "@/modules/auth/guard";
import { getRental } from "@/modules/booking/repository/rentals";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const rental = await getRental(id);
    requireOwnerOrAdmin(request, rental.user_id, OPS_OR_MARSHAL_ROLES, "Not your rental");
    return NextResponse.json(rental);
  } catch (error) {
    return handleRouteError(error);
  }
}
