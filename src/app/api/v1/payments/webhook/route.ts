import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { toVerifyResult, verifyWebhookSignature, type PaystackVerifyData } from "@/modules/payments/paystack";
import { processPaymentResult } from "@/modules/paymentHub/service";

// POST /api/v1/payments/webhook — signature verified over the raw request
// body (read as text before any JSON parsing, matching the source reading
// raw bytes first). This is the backend's actual source of truth for a
// payment's outcome: the client-triggered GET /api/v1/payment-hub/verify/
// {reference} exists for the browser/app's own post-checkout redirect, but a
// user closing the app before that call fires must not mean the payment is
// never processed. Paystack's own transaction object is the same shape in
// both a verify response and a webhook event's `data` — toVerifyResult
// (shared with the verify path) maps it either way, so there's exactly one
// place that decides what a successful/failed payment means
// (processPaymentResult), not two that can drift.
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-paystack-signature") ?? "";
    if (!verifyWebhookSignature(rawBody, signature)) {
      throw new ApiError(400, "Invalid webhook signature");
    }
    const event = JSON.parse(rawBody) as { event?: string; data?: PaystackVerifyData };

    // Only charge events carry a transaction we can process this way;
    // anything else (transfer events, subscription events, ...) is
    // acknowledged and ignored rather than treated as an error.
    if (event.data?.reference && (event.event === "charge.success" || event.event === "charge.failed")) {
      const result = toVerifyResult(event.data);
      try {
        await processPaymentResult(event.data.reference, result);
      } catch {
        // A failure here (e.g. seats no longer available, so the booking
        // couldn't be completed even though Paystack was paid) has already
        // been compensated for inside processPaymentResult — a refund is
        // issued and the payment row is correctly marked. There's nothing
        // more useful this endpoint can do with that, and returning a
        // non-2xx here would just make Paystack retry a webhook that's
        // already been fully handled (processPaymentResult's own
        // already_processed check makes a retry a safe no-op regardless,
        // but there's no reason to invite it).
      }
    }

    return NextResponse.json({ event: event.event, status: "received" });
  } catch (error) {
    return handleRouteError(error);
  }
}
