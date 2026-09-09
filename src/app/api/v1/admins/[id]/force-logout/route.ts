import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { SUPER_ADMIN_ONLY, requireAdminAuth, requireRequestId } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { forceLogout } from "@/modules/admin/repository";
import { idParamSchema } from "@/modules/admin/validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/admins/{admin_id}/force-logout — invalidates every token
// this admin currently holds (see requireAdminAuth in guard.ts for the
// mechanism). SUPER_ADMIN_ONLY, matching reset-password.
export async function POST(request: NextRequest, { params }: Params) {
  const headerError = requireRequestId(request);
  if (headerError) return headerError;
  try {
    const actor = await requireAdminAuth(request, SUPER_ADMIN_ONLY);
    const id = idParamSchema.parse((await params).id);
    await forceLogout(id);
    recordAuditLog(actor, request, "UPDATE", "admin", id, { action: "force_logout" });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
