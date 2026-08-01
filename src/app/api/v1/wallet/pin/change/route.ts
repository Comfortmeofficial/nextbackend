import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { changePin } from "@/modules/wallet/repository";
import { changePinSchema } from "@/modules/wallet/validation";

// POST /api/v1/wallet/pin/change
export async function POST(request: NextRequest) {
  try {
    const { user_id, current_pin, new_pin } = changePinSchema.parse(await request.json());
    await changePin(user_id, current_pin, new_pin);
    return NextResponse.json({ message: "PIN changed successfully" });
  } catch (error) {
    return handleRouteError(error);
  }
}
