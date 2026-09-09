import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { resetPassword } from "@/modules/drivers/auth-service";
import { idParamSchema } from "@/lib/common-validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/drivers/{driver_id}/reset-password — returns the new
// temporary password in plaintext, so this absolutely needs to require an
// admin token rather than being open to anyone who knows a driver id.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const actor = await requireAdminAuth(request, OPS_ROLES);
    const id = idParamSchema.parse((await params).id);
    const temporary_password = await resetPassword(id);
    // Never put the temporary password itself into the audit details.
    recordAuditLog(actor, request, "UPDATE", "driver", id, { action: "reset_password" });
    return NextResponse.json({ temporary_password });
  } catch (error) {
    return handleRouteError(error);
  }
}
