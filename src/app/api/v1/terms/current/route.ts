import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { getCurrentTerms } from "@/modules/terms/repository";

// GET /api/v1/terms/current
export async function GET() {
  try {
    const terms = await getCurrentTerms();
    return NextResponse.json(terms);
  } catch (error) {
    return handleRouteError(error);
  }
}
