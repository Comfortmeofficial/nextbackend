import { NextRequest, NextResponse } from "next/server";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { busErrorResponse } from "@/modules/buses/errors";
import { getBusLayout } from "@/modules/buses/repository";
import { parseBusId } from "@/modules/buses/validation";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/buses/{id}/layout — returns the raw SeatLayout, not the full bus.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const id = parseBusId((await params).id);
    const layout = await getBusLayout(id);
    return NextResponse.json(layout);
  } catch (error) {
    return busErrorResponse(error);
  }
}
