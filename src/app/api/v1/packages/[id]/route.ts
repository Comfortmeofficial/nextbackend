import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { getPackage } from "@/modules/booking/repository/packages";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const pkg = await getPackage(id);
    return NextResponse.json(pkg);
  } catch (error) {
    return handleRouteError(error);
  }
}
