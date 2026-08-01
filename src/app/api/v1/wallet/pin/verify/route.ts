import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { verifyPin } from "@/modules/wallet/repository";
import { verifyPinSchema } from "@/modules/wallet/validation";

// POST /api/v1/wallet/pin/verify
export async function POST(request: NextRequest) {
  try {
    const { user_id, pin } = verifyPinSchema.parse(await request.json());
    const valid = await verifyPin(user_id, pin);
    if (!valid) {
      throw new ApiError(400, "Incorrect PIN");
    }
    return NextResponse.json({ message: "PIN verified" });
  } catch (error) {
    return handleRouteError(error);
  }
}
