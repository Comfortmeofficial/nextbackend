import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { getCurrentTerms } from "@/modules/terms/repository";
import { termsCurrentQuerySchema } from "@/modules/terms/validation";

// GET /api/v1/terms/current?doc_type=terms|privacy — defaults to "terms" so
// existing callers that don't pass doc_type keep working unchanged.
export async function GET(request: NextRequest) {
  try {
    const { doc_type } = termsCurrentQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const terms = await getCurrentTerms(doc_type);
    return NextResponse.json(terms);
  } catch (error) {
    return handleRouteError(error);
  }
}
