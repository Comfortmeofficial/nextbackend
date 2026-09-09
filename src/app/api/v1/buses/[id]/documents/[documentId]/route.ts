import { NextRequest, NextResponse } from "next/server";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { busErrorResponse } from "@/modules/buses/errors";
import { deleteBusDocument } from "@/modules/buses/repository";
import { parseBusId } from "@/modules/buses/validation";

type Params = { params: Promise<{ id: string; documentId: string }> };

// DELETE /api/v1/buses/{id}/documents/{documentId}
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const actor = requireAdminAuth(request, OPS_ROLES);
    const { id: rawId, documentId: rawDocumentId } = await params;
    const id = parseBusId(rawId);
    const documentId = parseBusId(rawDocumentId);
    await deleteBusDocument(id, documentId);
    recordAuditLog(actor, request, "DELETE", "bus_document", documentId, { bus_id: id });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return busErrorResponse(error);
  }
}
