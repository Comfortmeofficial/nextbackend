import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { getBookingSurvey, submitBookingSurvey } from "@/modules/booking/survey";
import { surveyAnswersInputSchema } from "@/modules/booking/survey-validation";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    return NextResponse.json(await getBookingSurvey(id, requireCustomerAuth(request)));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const input = surveyAnswersInputSchema.parse(await request.json());
    return NextResponse.json(await submitBookingSurvey(id, requireCustomerAuth(request), input.answers), { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}