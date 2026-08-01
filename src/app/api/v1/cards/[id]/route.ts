import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { deleteCard, listCards } from "@/modules/cards/repository";
import { idParamSchema, userIdQuerySchema } from "@/modules/cards/validation";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/cards/{user_id} — lists a user's cards (the legacy route
// literally names this path segment user_id, not card_id).
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const userId = idParamSchema.parse((await params).id);
    const cards = await listCards(userId);
    return NextResponse.json(cards);
  } catch (error) {
    return handleRouteError(error);
  }
}

// DELETE /api/v1/cards/{card_id}?user_id=...
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const cardId = idParamSchema.parse((await params).id);
    const { user_id } = userIdQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    await deleteCard(cardId, user_id);
    return NextResponse.json({ message: "Card deleted" });
  } catch (error) {
    return handleRouteError(error);
  }
}
