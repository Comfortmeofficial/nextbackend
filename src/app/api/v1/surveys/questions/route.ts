import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { FULL_ACCESS, requireAdminAuth } from "@/modules/admin/guard";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { createSurveyQuestion, listSurveyQuestions } from "@/modules/booking/survey";
import { surveyQuestionInputSchema } from "@/modules/booking/survey-validation";

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("include_inactive") === "true") {
      await requireAdminAuth(request, FULL_ACCESS);
      return NextResponse.json(await listSurveyQuestions(true));
    }
    requireCustomerAuth(request);
    return NextResponse.json(await listSurveyQuestions());
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminAuth(request, FULL_ACCESS);
    const input = surveyQuestionInputSchema.parse(await request.json());
    return NextResponse.json(await createSurveyQuestion(input.question, input.sort_order, input.is_active), { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}