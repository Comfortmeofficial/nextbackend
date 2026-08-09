import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { resetPassword } from "@/modules/drivers/auth-service";
import { idParamSchema } from "@/lib/common-validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/drivers/{driver_id}/reset-password — returns the new
// temporary password in plaintext, so this absolutely needs to require an
// admin token rather than being open to anyone who knows a driver id.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const id = idParamSchema.parse((await params).id);
    const temporary_password = await resetPassword(id);
    return NextResponse.json({ temporary_password });
  } catch (error) {
    return handleRouteError(error);
  }
}
