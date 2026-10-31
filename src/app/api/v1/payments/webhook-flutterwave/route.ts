import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { verifyPaymentByReference, verifyWebhookSignature, type FlutterwaveVerifyData } from "@/modules/payments/flutterwave";
import { processPaymentResult } from "@/modules/paymentHub/service";

// POST /api/v1/payments/webhook-flutterwave — a sibling to the Paystack
// webhook (src/app/api/v1/payments/webhook/route.ts), kept separate rather
// than merged into one route since the two gateways' payload shapes and
// signature schemes differ structurally. The `verif-hash` header is checked
// by plain constant-time string compare (not an HMAC like Paystack's), per
// Flutterwave's own docs. Flutterwave's docs also recommend re-verifying
// server-side rather than trusting the webhook payload alone, so this calls
// verifyPaymentByReference instead of mapping event.data directly.
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("verif-hash") ?? "";
    if (!verifyWebhookSignature(signature)) {
      throw new ApiError(400, "Invalid webhook signature");
    }
    const event = JSON.parse(rawBody) as { event?: string; data?: FlutterwaveVerifyData };

    if (event.data?.tx_ref && event.event === "charge.completed") {
      try {
        const result = await verifyPaymentByReference(event.data.tx_ref);
        await processPaymentResult(event.data.tx_ref, result);
      } catch {
        // Already compensated inside processPaymentResult if anything
        // internal failed (e.g. a refund was issued) — see the Paystack
        // webhook's identical comment for why this is swallowed.
      }
    }

    return NextResponse.json({ event: event.event, status: "received" });
  } catch (error) {
    return handleRouteError(error);
  }
}
