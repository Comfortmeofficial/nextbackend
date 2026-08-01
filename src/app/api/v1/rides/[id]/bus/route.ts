import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { fetchBusInfo } from "@/modules/booking/external";
import { updateRideBus } from "@/modules/booking/repository/rides";
import { parseBookingId } from "@/modules/booking/util";
import { rideBusInputSchema } from "@/modules/booking/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const { bus_id } = rideBusInputSchema.parse(await request.json());
    let bus;
    try {
      bus = await fetchBusInfo(bus_id);
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : String(err));
    }
    const ride = await updateRideBus(id, bus_id, bus.plateNumber, bus.model);
    return NextResponse.json(ride);
  } catch (error) {
    return handleRouteError(error);
  }
}
