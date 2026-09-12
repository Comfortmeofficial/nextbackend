import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { listQuerySchema } from "@/lib/common-validation";
import { listPayments } from "@/modules/payments/repository";

// GET /api/v1/payments?skip=0&limit=50 — the admin dashboard's payments
// ledger. Deliberately thin for now (no filtering) — this exists so the
// payments table introduced alongside it is actually observable end-to-end;
// the full filtered/paginated admin view is a separate follow-up.
export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth(request, OPS_ROLES);
    const { skip, limit } = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const items = await listPayments(skip, limit);
    return NextResponse.json(items);
  } catch (error) {
    return handleRouteError(error);
  }
}
