import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { listAvailableDrivers } from "@/modules/drivers/repository";

// GET /api/v1/drivers/available
export async function GET() {
  try {
    const drivers = await listAvailableDrivers();
    return NextResponse.json(drivers);
  } catch (error) {
    return handleRouteError(error);
  }
}
