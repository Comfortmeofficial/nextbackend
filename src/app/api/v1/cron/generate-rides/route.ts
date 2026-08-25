import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireCronOrAdminAuth } from "@/modules/admin/guard";
import { ensureScheduledRidesGenerated } from "@/modules/booking/repository/ride-schedules";

// GET /api/v1/cron/generate-rides — Vercel Cron issues GET requests to the
// configured path, matched by vercel.json's `crons` entry with a
// `Bearer {CRON_SECRET}` header. Also callable by any OPS-role admin (the
// Schedules page fires this on load as a fire-and-forget opportunistic
// trigger), so the feature works whether or not the cron config is
// actually wired up on the deploy target. Idempotent — safe to call as
// often as needed.
export async function GET(request: NextRequest) {
  try {
    requireCronOrAdminAuth(request, OPS_ROLES);
    const summary = await ensureScheduledRidesGenerated();
    return NextResponse.json(summary);
  } catch (error) {
    return handleRouteError(error);
  }
}
