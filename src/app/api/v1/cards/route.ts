import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { addCard } from "@/modules/cards/repository";
import { cardCreateSchema } from "@/modules/cards/validation";

// POST /api/v1/cards/
export async function POST(request: NextRequest) {
  try {
    const body = cardCreateSchema.parse(await request.json());
    if (requireCustomerAuth(request) !== body.user_id) {
      throw new ApiError(403, "Not your account");
    }
    const card = await addCard(body);
    return NextResponse.json(card, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
