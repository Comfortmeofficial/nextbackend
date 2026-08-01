import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { assignRide } from "@/modules/drivers/repository";
import { assignRideSchema } from "@/modules/drivers/validation";
import { idParamSchema } from "@/lib/common-validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/drivers/{driver_id}/assign-ride
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const id = idParamSchema.parse((await params).id);
    const { ride_id } = assignRideSchema.parse(await request.json());
    const driver = await assignRide(id, ride_id);
    return NextResponse.json(driver);
  } catch (error) {
    return handleRouteError(error);
  }
}
