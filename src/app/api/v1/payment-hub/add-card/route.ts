import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { addCard } from "@/modules/paymentHub/service";
import { addCardRequestSchema } from "@/modules/paymentHub/validation";

// POST /api/v1/payment-hub/add-card
export async function POST(request: NextRequest) {
  try {
    const input = addCardRequestSchema.parse(await request.json());
    const result = await addCard(input);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
