import * as flutterwave from "./flutterwave";
import * as paystack from "./paystack";
import { getPaymentByReference } from "./repository";
import type { InitializePaymentResult, PaymentGateway, VerifyPaymentResult } from "./types";

export { getActiveGateway, setActiveGateway } from "./settings";

export async function initializeWithGateway(
  gateway: PaymentGateway,
  input: {
    amount: number;
    email: string;
    name?: string | null;
    phone?: string | null;
    reference?: string | null;
    callback_url?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<InitializePaymentResult> {
  return gateway === "flutterwave" ? flutterwave.initializePayment(input) : paystack.initializePayment(input);
}

// Dispatches on the gateway a payment was actually INITIATED with (the
// `payments` row's own stored `gateway` column), never on whichever gateway
// is currently active — an admin flipping the toggle must not change how an
// already-in-flight payment gets verified. Defaults to 'paystack' if no
// local payment row exists for this reference (pre-existing behavior for
// any reference this backend didn't itself create).
export async function verifyByReference(reference: string): Promise<VerifyPaymentResult> {
  const payment = await getPaymentByReference(reference);
  const gateway: PaymentGateway = payment?.gateway ?? "paystack";
  return gateway === "flutterwave"
    ? flutterwave.verifyPaymentByReference(reference)
    : paystack.verifyPayment(reference);
}

// Re-charges a previously-saved card's token — dispatches on the CARD's own
// stored gateway (which gateway originally minted the token), never the
// currently-active one.
export async function chargeSavedCard(
  card: { gateway: PaymentGateway; token: string },
  input: { email: string; amount: number; reference?: string | null },
): Promise<VerifyPaymentResult> {
  return card.gateway === "flutterwave"
    ? flutterwave.chargeToken({ token: card.token, ...input })
    : paystack.chargeAuthorization({ authorization_code: card.token, ...input });
}
