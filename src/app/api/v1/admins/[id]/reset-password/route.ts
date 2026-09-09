import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { SUPER_ADMIN_ONLY, requireAdminAuth, requireRequestId } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { resetPassword } from "@/modules/admin/auth-service";
import { idParamSchema } from "@/modules/admin/validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/admins/{admin_id}/reset-password — returns the new temporary
// password in plaintext, same shape as drivers/{id}/reset-password.
// SUPER_ADMIN_ONLY, matching every other mutation on the admins resource
// (PUT/DELETE /admins/{id}) rather than the broader OPS_ROLES the driver
// version uses — resetting another admin's own credentials is more
// sensitive than resetting a driver's.
export async function POST(request: NextRequest, { params }: Params) {
  const headerError = requireRequestId(request);
  if (headerError) return headerError;
  try {
    const actor = await requireAdminAuth(request, SUPER_ADMIN_ONLY);
    const id = idParamSchema.parse((await params).id);
    const temporary_password = await resetPassword(id);
    // Never put the temporary password itself into the audit details.
    recordAuditLog(actor, request, "UPDATE", "admin", id, { action: "reset_password" });
    return NextResponse.json({ temporary_password });
  } catch (error) {
    return handleRouteError(error);
  }
}
