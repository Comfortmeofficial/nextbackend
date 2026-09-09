import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_OR_MARSHAL_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { getPackage } from "@/modules/booking/repository/packages";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

// Admin-only — no mobile package-detail screen exists today.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireAdminAuth(request, OPS_OR_MARSHAL_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const pkg = await getPackage(id);
    return NextResponse.json(pkg);
  } catch (error) {
    return handleRouteError(error);
  }
}
