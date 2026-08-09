import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { FULL_ACCESS, requireAdminAuth } from "@/modules/admin/guard";
import { createTerms, listTerms } from "@/modules/terms/repository";
import { listQuerySchema, termsCreateSchema } from "@/modules/terms/validation";

// POST /api/v1/terms/
export async function POST(request: NextRequest) {
  try {
    requireAdminAuth(request, FULL_ACCESS);
    const body = termsCreateSchema.parse(await request.json());
    const terms = await createTerms(body);
    return NextResponse.json(terms, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

// GET /api/v1/terms/?skip=0&limit=100
export async function GET(request: NextRequest) {
  try {
    requireAdminAuth(request, FULL_ACCESS);
    const { skip, limit } = listQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const terms = await listTerms(skip, limit);
    return NextResponse.json(terms);
  } catch (error) {
    return handleRouteError(error);
  }
}
