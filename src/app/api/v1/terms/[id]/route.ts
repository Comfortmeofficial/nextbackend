import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { FULL_ACCESS, requireAdminAuth } from "@/modules/admin/guard";
import { getTerms, updateTerms } from "@/modules/terms/repository";
import { idParamSchema, termsUpdateSchema } from "@/modules/terms/validation";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/terms/{id}
export async function GET(request: NextRequest, { params }: Params) {
  try {
    requireAdminAuth(request, FULL_ACCESS);
    const id = idParamSchema.parse((await params).id);
    const terms = await getTerms(id);
    return NextResponse.json(terms);
  } catch (error) {
    return handleRouteError(error);
  }
}

// PUT /api/v1/terms/{id}
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    requireAdminAuth(request, FULL_ACCESS);
    const id = idParamSchema.parse((await params).id);
    const body = termsUpdateSchema.parse(await request.json());
    const terms = await updateTerms(id, body);
    return NextResponse.json(terms);
  } catch (error) {
    return handleRouteError(error);
  }
}
