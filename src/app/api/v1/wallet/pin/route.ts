import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { notifyPinCreated } from "@/modules/wallet/notify";
import { setPin } from "@/modules/wallet/repository";
import { setPinSchema } from "@/modules/wallet/validation";

// POST /api/v1/wallet/pin — the source awaits its (error-swallowing)
// notification step synchronously before responding (it's a blocking Python
// call inside a sync route handler, not fire-and-forget like auth's OTP/
// waitlist notifications), so this does too.
export async function POST(request: NextRequest) {
  try {
    const { user_id, pin } = setPinSchema.parse(await request.json());
    if (requireCustomerAuth(request) !== user_id) {
      throw new ApiError(403, "Not your wallet");
    }
    await setPin(user_id, pin);
    await notifyPinCreated(user_id);
    return NextResponse.json({ message: "PIN set successfully" });
  } catch (error) {
    return handleRouteError(error);
  }
}
