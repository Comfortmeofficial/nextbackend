import { NextRequest, NextResponse } from "next/server";
import { busErrorResponse } from "@/modules/buses/errors";
import { assignDriver, unassignDriver } from "@/modules/buses/repository";
import { assignDriverSchema, parseBusId } from "@/modules/buses/validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/buses/{id}/driver
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const id = parseBusId((await params).id);
    const { driver_id } = assignDriverSchema.parse(await request.json());
    const bus = await assignDriver(id, driver_id);
    return NextResponse.json(bus);
  } catch (error) {
    return busErrorResponse(error);
  }
}

// DELETE /api/v1/buses/{id}/driver
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const id = parseBusId((await params).id);
    const bus = await unassignDriver(id);
    return NextResponse.json(bus);
  } catch (error) {
    return busErrorResponse(error);
  }
}
