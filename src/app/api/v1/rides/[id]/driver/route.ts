import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { fetchDriverInfo } from "@/modules/booking/external";
import { updateRideDriver } from "@/modules/booking/repository/rides";
import { parseBookingId } from "@/modules/booking/util";
import { rideDriverInputSchema } from "@/modules/booking/validation";
import { assertDriverAssignable } from "@/modules/drivers/repository";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const actor = requireAdminAuth(request, OPS_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const { driver_id } = rideDriverInputSchema.parse(await request.json());
    let driver;
    try {
      driver = await fetchDriverInfo(driver_id);
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : String(err));
    }
    await assertDriverAssignable(driver_id);
    const ride = await updateRideDriver(id, driver_id, driver.fullName, driver.rating);
    recordAuditLog(actor, request, "UPDATE", "ride", id, { driver_id });
    return NextResponse.json(ride);
  } catch (error) {
    return handleRouteError(error);
  }
}
