import { NextRequest, NextResponse } from "next/server";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { busErrorResponse } from "@/modules/buses/errors";
import { createBus, listBuses } from "@/modules/buses/repository";
import { createBusSchema } from "@/modules/buses/validation";

// POST /api/v1/buses
export async function POST(request: NextRequest) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const body = createBusSchema.parse(await request.json());
    const bus = await createBus(body);
    return NextResponse.json(bus, { status: 201 });
  } catch (error) {
    return busErrorResponse(error);
  }
}

// GET /api/v1/buses — always 200, even on a backing query failure (matches
// the source's unwrap_or_default()), but an auth failure still short-circuits.
export async function GET(request: NextRequest) {
  try {
    requireAdminAuth(request, OPS_ROLES);
  } catch (error) {
    return busErrorResponse(error);
  }
  const buses = await listBuses();
  return NextResponse.json(buses);
}
