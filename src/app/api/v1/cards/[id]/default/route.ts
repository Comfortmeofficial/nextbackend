import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { setDefaultCard } from "@/modules/cards/repository";
import { idParamSchema, userIdQuerySchema } from "@/modules/cards/validation";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/v1/cards/{card_id}/default?user_id=...
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const cardId = idParamSchema.parse((await params).id);
    const { user_id } = userIdQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const card = await setDefaultCard(cardId, user_id);
    return NextResponse.json(card);
  } catch (error) {
    return handleRouteError(error);
  }
}
