import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { completeRide } from "@/modules/drivers/repository";
import { idParamSchema } from "@/lib/common-validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/drivers/{driver_id}/complete-ride
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const id = idParamSchema.parse((await params).id);
    const driver = await completeRide(id);
    return NextResponse.json(driver);
  } catch (error) {
    return handleRouteError(error);
  }
}
