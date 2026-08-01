import { randomUUID } from "node:crypto";
import { sendPaymentNotification } from "@/modules/notifications/service";
import { convertReferral } from "@/modules/rewards/repository";
import { getUser } from "@/modules/users/repository";
import { fundWallet } from "@/modules/wallet/repository";
import type { PaymentMethod } from "./validation";

// Nominal amount charged to tokenize a new card; Paystack returns a reusable
// authorization_code from any successful charge, verification or not.
export const CARD_VERIFICATION_AMOUNT = 50.0;

// Cancellation always refunds to wallet, regardless of original payment
// method, minus this fee.
export const CANCELLATION_DEDUCTION_RATE = 0.1;

// A wallet-funding transaction only counts toward a referral milestone once
// it reaches this amount; smaller top-ups don't trigger a referrer payout.
export const REFERRAL_WALLET_FUNDING_THRESHOLD = 5000.0;

// payment_hub's PaymentMethod values (wallet/debit_card/bank_transfer) differ
// from booking's Rental.PaymentMethod values (wallet/card/bank) — map
// between them.
export const RENTAL_PAYMENT_METHOD: Record<PaymentMethod, "wallet" | "card" | "bank"> = {
  wallet: "wallet",
  debit_card: "card",
  bank_transfer: "bank",
};

export interface NotificationContact {
  phone: string | null;
  email: string | null;
  push_token: string | null;
}

// Fetch phone/push_token for a user to include in a notification call.
// Best-effort: a user lookup failure must not block payment/booking flows.
export async function notificationContact(userId: number): Promise<NotificationContact> {
  try {
    const user = await getUser(userId);
    if (!user) return { phone: null, email: null, push_token: null };
    return {
      phone: user.phone,
      email: user.email,
      push_token: user.push_notifications_enabled ? user.push_token : null,
    };
  } catch {
    return { phone: null, email: null, push_token: null };
  }
}

// Pays the referrer once, the first time their referee (this user) books a
// trip or funds their wallet with at least NGN 5000. Best-effort: a failure
// here must never block the referee's own booking/funding flow.
export async function rewardReferrerIfEligible(
  userId: number,
  trigger: "booking" | "wallet_funding",
  amount?: number,
): Promise<void> {
  if (trigger === "wallet_funding" && (amount == null || amount < REFERRAL_WALLET_FUNDING_THRESHOLD)) {
    return;
  }
  try {
    const user = await getUser(userId);
    const code = user?.referral_code;
    if (!code) return;

    const conversion = await convertReferral({ code, referee_user_id: userId, trigger });
    if (!conversion.rewarded || conversion.referrer_user_id == null || conversion.reward_amount == null) {
      return;
    }

    const referrerId = conversion.referrer_user_id;
    const rewardAmount = conversion.reward_amount;
    const reference = randomUUID();
    const description =
      trigger === "booking"
        ? "Referral reward — your friend just booked a ride"
        : "Referral reward — your friend funded their wallet";

    await fundWallet({ user_id: referrerId, amount: rewardAmount, description, reference });

    const contact = await notificationContact(referrerId);
    await sendPaymentNotification({
      user_id: referrerId,
      amount: rewardAmount,
      type: "referral_reward",
      reference,
      phone: contact.phone,
      email: contact.email,
      push_token: contact.push_token,
    });
  } catch {
    // referral rewards are best-effort and must never block the primary flow
  }
}
