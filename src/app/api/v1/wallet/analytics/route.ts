import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { getAnalytics } from "@/modules/wallet/repository";
import { analyticsQuerySchema } from "@/modules/wallet/validation";

// GET /api/v1/wallet/analytics?range=month
export async function GET(request: NextRequest) {
  try {
    const { range } = analyticsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const points = await getAnalytics(range);
    return NextResponse.json(points);
  } catch (error) {
    return handleRouteError(error);
  }
}
