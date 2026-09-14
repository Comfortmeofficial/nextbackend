import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { createRoute, listRoutes } from "@/modules/booking/repository/routes";
import { listQuerySchema, routeInputSchema } from "@/modules/booking/validation";

// POST /api/v1/routes
export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminAuth(request, OPS_ROLES);
    const body = routeInputSchema.parse(await request.json());
    const route = await createRoute(body);
    recordAuditLog(actor, request, "CREATE", "route", route.id, body);
    return NextResponse.json(route, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

// GET /api/v1/routes?skip=0&limit=100&status=active — the Schedule/Ride
// creation pickers pass status=active so an inactive route never shows up
// there; the admin's own Routes page omits it to manage both.
export async function GET(request: NextRequest) {
  try {
    const { skip, limit } = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const statusParam = request.nextUrl.searchParams.get("status");
    const status = statusParam === "active" || statusParam === "inactive" ? statusParam : undefined;
    const items = await listRoutes(skip, limit, status);
    return NextResponse.json(items);
  } catch (error) {
    return handleRouteError(error);
  }
}
