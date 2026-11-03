import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { getRevenueAnalytics } from "@/modules/booking/repository/analytics";
import { revenueAnalyticsQuerySchema } from "@/modules/booking/validation";

// GET /api/v1/bookings/revenue-analytics?range=month — admin dashboard's
// revenue chart. Bucketed from actual bookings (any payment method), not
// wallet transactions — see getRevenueAnalytics for why.
export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth(request, OPS_ROLES);
    const { range } = revenueAnalyticsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const points = await getRevenueAnalytics(range);
    return NextResponse.json(points);
  } catch (error) {
    return handleRouteError(error);
  }
}
