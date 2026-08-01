import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { verifyWebhookSignature } from "@/modules/payments/paystack";

// POST /api/v1/payments/webhook — signature verified over the raw request
// body (read as text before any JSON parsing, matching the source reading
// raw bytes first).
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-paystack-signature") ?? "";
    if (!verifyWebhookSignature(rawBody, signature)) {
      throw new ApiError(400, "Invalid webhook signature");
    }
    // Dispatch event to payment_hub or relevant service
    const event = JSON.parse(rawBody);
    return NextResponse.json({ event: event.event, status: "received" });
  } catch (error) {
    return handleRouteError(error);
  }
}
