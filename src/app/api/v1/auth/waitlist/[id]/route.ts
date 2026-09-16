import { NextRequest, NextResponse } from "next/server";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { authErrorResponse } from "@/modules/auth/errors";
import { deleteWaitlistEntry, getWaitlistEntry, updateWaitlistEntry, type WaitlistInput } from "@/modules/auth/service";
import { idParamSchema } from "@/lib/common-validation";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/auth/waitlist/{id}
export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireAdminAuth(request, OPS_ROLES);
    const id = idParamSchema.parse((await params).id);
    const entry = await getWaitlistEntry(id);
    return NextResponse.json(entry);
  } catch (error) {
    return authErrorResponse(error);
  }
}

// PUT /api/v1/auth/waitlist/{id} — full replace of every editable field.
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const actor = await requireAdminAuth(request, OPS_ROLES);
    const id = idParamSchema.parse((await params).id);
    const body = (await request.json()) as Partial<WaitlistInput>;
    if (!body.full_name || !body.email) {
      return NextResponse.json({ detail: "full_name and email are required" }, { status: 400 });
    }
    const entry = await updateWaitlistEntry(id, body as WaitlistInput);
    recordAuditLog(actor, request, "UPDATE", "waitlist_entry", id, body);
    return NextResponse.json(entry);
  } catch (error) {
    return authErrorResponse(error);
  }
}

// DELETE /api/v1/auth/waitlist/{id}
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const actor = await requireAdminAuth(request, OPS_ROLES);
    const id = idParamSchema.parse((await params).id);
    await deleteWaitlistEntry(id);
    recordAuditLog(actor, request, "DELETE", "waitlist_entry", id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
