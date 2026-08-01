import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { createRoute, listRoutes } from "@/modules/booking/repository/routes";
import { listQuerySchema, routeInputSchema } from "@/modules/booking/validation";

// POST /api/v1/routes
export async function POST(request: NextRequest) {
  try {
    const body = routeInputSchema.parse(await request.json());
    const route = await createRoute(body);
    return NextResponse.json(route, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

// GET /api/v1/routes
export async function GET(request: NextRequest) {
  try {
    const { skip, limit } = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const items = await listRoutes(skip, limit);
    return NextResponse.json(items);
  } catch (error) {
    return handleRouteError(error);
  }
}
