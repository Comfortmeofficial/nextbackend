import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { FULL_ACCESS, requireAdminAuth } from "@/modules/admin/guard";
import { listAuditLogs } from "@/modules/admin/audit";

// GET /api/v1/audit-logs?skip=0&limit=20&start_date=&end_date= — a
// cross-platform view of every admin mutation, so it's gated tighter than
// most listings (FULL_ACCESS: super_admin + admin only, not the wider
// OPS_ROLES tier other resource lists use).
export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth(request, FULL_ACCESS);
    const params = request.nextUrl.searchParams;
    const skip = Number(params.get("skip") ?? "0") || 0;
    const limit = Number(params.get("limit") ?? "20") || 20;
    const startDate = params.get("start_date") || undefined;
    const endDate = params.get("end_date") || undefined;
    const logs = await listAuditLogs(skip, limit, startDate, endDate);
    return NextResponse.json(logs);
  } catch (error) {
    return handleRouteError(error);
  }
}
