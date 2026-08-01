import { NextRequest, NextResponse } from "next/server";
import { busErrorResponse } from "@/modules/buses/errors";
import { deleteBus, getBus, updateBus } from "@/modules/buses/repository";
import { parseBusId, updateBusSchema } from "@/modules/buses/validation";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/buses/{id} — no retired-status filter, unlike the list route.
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const id = parseBusId((await params).id);
    const bus = await getBus(id);
    return NextResponse.json(bus);
  } catch (error) {
    return busErrorResponse(error);
  }
}

// PUT /api/v1/buses/{id}
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const id = parseBusId((await params).id);
    const body = updateBusSchema.parse(await request.json());
    const bus = await updateBus(id, body);
    return NextResponse.json(bus);
  } catch (error) {
    return busErrorResponse(error);
  }
}

// DELETE /api/v1/buses/{id} — a soft "retire", not a real row deletion.
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const id = parseBusId((await params).id);
    await deleteBus(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return busErrorResponse(error);
  }
}
