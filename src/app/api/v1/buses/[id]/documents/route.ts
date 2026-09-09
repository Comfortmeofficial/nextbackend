import { NextRequest, NextResponse } from "next/server";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { busErrorResponse } from "@/modules/buses/errors";
import { createBusDocument, listBusDocuments } from "@/modules/buses/repository";
import { createBusDocumentSchema, parseBusId } from "@/modules/buses/validation";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/buses/{id}/documents
export async function GET(request: NextRequest, { params }: Params) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const id = parseBusId((await params).id);
    const documents = await listBusDocuments(id);
    return NextResponse.json(documents);
  } catch (error) {
    return busErrorResponse(error);
  }
}

// POST /api/v1/buses/{id}/documents — a bus can have any number of these
// (roadworthiness certificate, permit, etc.), each with its own title,
// unlike the single picture/insurance_document columns on the bus itself.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const actor = requireAdminAuth(request, OPS_ROLES);
    const id = parseBusId((await params).id);
    const body = createBusDocumentSchema.parse(await request.json());
    const document = await createBusDocument(id, body);
    recordAuditLog(actor, request, "CREATE", "bus_document", document.id, { bus_id: id, title: body.title });
    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    return busErrorResponse(error);
  }
}
