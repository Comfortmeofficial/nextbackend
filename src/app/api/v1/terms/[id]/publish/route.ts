import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { FULL_ACCESS, requireAdminAuth } from "@/modules/admin/guard";
import { publishTerms } from "@/modules/terms/repository";
import { idParamSchema } from "@/modules/terms/validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/terms/{id}/publish
export async function POST(request: NextRequest, { params }: Params) {
  try {
    requireAdminAuth(request, FULL_ACCESS);
    const id = idParamSchema.parse((await params).id);
    const terms = await publishTerms(id);
    return NextResponse.json(terms);
  } catch (error) {
    return handleRouteError(error);
  }
}
