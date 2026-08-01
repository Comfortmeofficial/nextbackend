import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { deleteDriver, getDriver, updateDriver } from "@/modules/drivers/repository";
import { driverUpdateSchema } from "@/modules/drivers/validation";
import { idParamSchema } from "@/lib/common-validation";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/drivers/{driver_id}
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const id = idParamSchema.parse((await params).id);
    const driver = await getDriver(id);
    return NextResponse.json(driver);
  } catch (error) {
    return handleRouteError(error);
  }
}

// PUT /api/v1/drivers/{driver_id}
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const id = idParamSchema.parse((await params).id);
    const body = driverUpdateSchema.parse(await request.json());
    const driver = await updateDriver(id, body);
    return NextResponse.json(driver);
  } catch (error) {
    return handleRouteError(error);
  }
}

// DELETE /api/v1/drivers/{driver_id}
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const id = idParamSchema.parse((await params).id);
    await deleteDriver(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
