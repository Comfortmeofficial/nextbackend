import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { addCard } from "@/modules/cards/repository";
import { cardCreateSchema } from "@/modules/cards/validation";

// POST /api/v1/cards/
export async function POST(request: NextRequest) {
  try {
    const body = cardCreateSchema.parse(await request.json());
    const card = await addCard(body);
    return NextResponse.json(card, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
