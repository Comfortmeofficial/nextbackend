import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { FULL_ACCESS, requireAdminAuth } from "@/modules/admin/guard";
import { deleteSurveyQuestion, updateSurveyQuestion } from "@/modules/booking/survey";
import { surveyQuestionInputSchema } from "@/modules/booking/survey-validation";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requireAdminAuth(request, FULL_ACCESS);
    const id = Number((await params).id);
    const input = surveyQuestionInputSchema.parse(await request.json());
    return NextResponse.json(await updateSurveyQuestion(id, input.question, input.question_type, input.options, input.sort_order, input.is_active));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    await requireAdminAuth(request, FULL_ACCESS);
    await deleteSurveyQuestion(Number((await params).id));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}