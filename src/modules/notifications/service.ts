import { formatNaira } from "./format";
import { sendEmail } from "./providers/resend";
import { sendPush } from "./providers/expo";
import { sendSms } from "./providers/twilio";
import { storeNotification } from "./repository";
import type {
  bookingCancelledSchema,
  bookingNotificationSchema,
  otpNotificationSchema,
  paymentNotificationSchema,
  pinCreatedSchema,
  rentalConfirmedSchema,
  rentalPricedSchema,
  rentalRejectedSchema,
  rentalRequestReceivedSchema,
  rideReminderSchema,
  rideUpdateSchema,
  waitlistNotificationSchema,
} from "./validation";
import type { z } from "zod";

// Extracted so route handlers and other already-migrated modules (auth,
// wallet) can call the same logic directly in-process instead of over HTTP
// now that this service lives in the same app — same "collapse the hop once
// colocated" reasoning used for user_service.

const PURPOSE_LABELS: Record<string, string> = {
  signup: "account verification",
  password_reset: "password reset",
  wallet_pin: "wallet PIN setup",
};

export async function sendOtpNotification(data: z.infer<typeof otpNotificationSchema>) {
  const label = PURPOSE_LABELS[data.purpose] ?? data.purpose;
  const smsBody = `Your Comfort Me ${label} OTP is: ${data.otp}. Valid for 10 minutes. Do not share.`;
  const pushTitle = "Your OTP Code";
  const pushBody = `${data.otp} is your Comfort Me ${label} code. Valid for 10 minutes.`;
  const emailHtml = `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
    <h1 style="color:#111827;font-size:22px;margin-bottom:8px;">Your Comfort Me verification code</h1>
    <p style="color:#6b7280;font-size:16px;">Use this code to complete your ${label}:</p>
    <p style="font-size:32px;font-weight:bold;letter-spacing:4px;color:#f97316;margin:24px 0;">${data.otp}</p>
    <p style="color:#9ca3af;font-size:13px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
  </div>
  `;

  if (data.phone) await sendSms(data.phone, smsBody);
  if (data.push_token) await sendPush(data.push_token, pushTitle, pushBody, { type: "otp", purpose: data.purpose });
  if (data.email) await sendEmail(data.email, `Your Comfort Me ${label} code`, emailHtml);

  await storeNotification(data.user_id, "otp", pushTitle, pushBody);
  return { message: "OTP notification sent", purpose: data.purpose };
}

export async function sendBookingNotification(data: z.infer<typeof bookingNotificationSchema>) {
  const title = "Booking Confirmed! \u{1F389}";
  const body = `Ref: ${data.reference} · NGN ${formatNaira(data.amount)}. Have a comfortable ride!`;
  const smsBody = `Booking Confirmed! Reference: ${data.reference}. Amount: NGN ${formatNaira(data.amount)}. Have a comfortable ride!`;
  const emailHtml = `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
    <h1 style="color:#111827;font-size:22px;margin-bottom:8px;">Booking Confirmed! \u{1F389}</h1>
    <p style="color:#6b7280;font-size:16px;">Reference: <strong>${data.reference}</strong></p>
    <p style="color:#6b7280;font-size:16px;">Amount: NGN ${formatNaira(data.amount)}</p>
    <p style="color:#9ca3af;font-size:13px;">Have a comfortable ride!</p>
  </div>
  `;

  if (data.phone) await sendSms(data.phone, smsBody);
  if (data.push_token) await sendPush(data.push_token, title, body, { type: "booking", reference: data.reference });
  if (data.email) await sendEmail(data.email, title, emailHtml);

  await storeNotification(data.user_id, "booking", title, body);
  return { message: "Booking confirmation sent" };
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  wallet_funded: "Wallet Funding",
  booking_payment: "Trip Payment",
  refund: "Refund",
  referral_reward: "Referral Reward",
  package_payment: "Package Delivery",
};

export async function sendPaymentNotification(data: z.infer<typeof paymentNotificationSchema>) {
  const label = PAYMENT_TYPE_LABELS[data.type] ?? data.type;
  const title = `${label} Successful`;
  const body = `NGN ${formatNaira(data.amount)} · Ref: ${data.reference}`;
  const emailHtml = `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
    <h1 style="color:#111827;font-size:22px;margin-bottom:8px;">${title}</h1>
    <p style="color:#6b7280;font-size:16px;">Amount: NGN ${formatNaira(data.amount)}</p>
    <p style="color:#6b7280;font-size:16px;">Reference: <strong>${data.reference}</strong></p>
  </div>
  `;

  if (data.phone) await sendSms(data.phone, `${title}! ${body}.`);
  if (data.push_token) await sendPush(data.push_token, title, body, { type: "payment", payment_type: data.type });
  if (data.email) await sendEmail(data.email, title, emailHtml);

  await storeNotification(data.user_id, "payment", title, body);
  return { message: "Payment notification sent" };
}

export async function sendRideReminder(data: z.infer<typeof rideReminderSchema>) {
  const title = "Your trip is coming up! \u{1F68C}";
  const body = `Departure at ${data.departure_time}. Please arrive early.`;
  const smsBody = `Reminder: Your Comfort Me trip departs at ${data.departure_time}. Please arrive early. Ref: Ride #${data.ride_id}.`;

  if (data.phone) await sendSms(data.phone, smsBody);
  if (data.push_token) await sendPush(data.push_token, title, body, { type: "ride_reminder", ride_id: data.ride_id });

  await storeNotification(data.user_id, "ride_reminder", title, body);
  return { message: "Ride reminder sent" };
}

export async function sendRideUpdate(data: z.infer<typeof rideUpdateSchema>) {
  const title = "Trip Update";

  if (data.phone) await sendSms(data.phone, data.message);
  if (data.push_token) {
    await sendPush(data.push_token, title, data.message, { type: "ride_update", ride_id: data.ride_id });
  }

  await storeNotification(data.user_id, "ride_update", title, data.message);
  return { message: "Ride update sent" };
}

export async function sendPinCreatedNotification(data: z.infer<typeof pinCreatedSchema>) {
  const title = "Wallet PIN Set \u{1F512}";
  const body = "Your wallet PIN was created. If this wasn't you, contact support immediately.";

  if (data.phone) await sendSms(data.phone, body);
  if (data.push_token) await sendPush(data.push_token, title, body, { type: "wallet_pin" });
  if (data.email) await sendEmail(data.email, title, `<p>${body}</p>`);

  await storeNotification(data.user_id, "wallet_pin", title, body);
  return { message: "PIN created notification sent" };
}

export async function sendBookingCancelledNotification(data: z.infer<typeof bookingCancelledSchema>) {
  const title = "Booking Cancelled";
  const body =
    `Ref: ${data.reference} · NGN ${formatNaira(data.deduction)} cancellation fee deducted. ` +
    `NGN ${formatNaira(data.refund_amount)} refunded to your wallet.`;

  if (data.phone) await sendSms(data.phone, `${title}. ${body}`);
  if (data.push_token) {
    await sendPush(data.push_token, title, body, { type: "booking_cancelled", reference: data.reference });
  }
  if (data.email) await sendEmail(data.email, title, `<p>${body}</p>`);

  await storeNotification(data.user_id, "booking_cancelled", title, body);
  return { message: "Booking cancellation notification sent" };
}

export async function sendRentalRequestReceivedNotification(
  data: z.infer<typeof rentalRequestReceivedSchema>,
) {
  const title = "Rental Request Received";
  const body = `We've received your rental request for ${data.pickup} to ${data.destination} and are reviewing it.`;

  if (data.phone) await sendSms(data.phone, body);
  if (data.push_token) await sendPush(data.push_token, title, body, { type: "rental_request_received" });
  if (data.email) await sendEmail(data.email, title, `<p>${body}</p>`);

  await storeNotification(data.user_id, "rental_request_received", title, body);
  return { message: "Rental request received notification sent" };
}

export async function sendRentalPricedNotification(data: z.infer<typeof rentalPricedSchema>) {
  const title = "Your Rental Has Been Priced";
  const body = `${data.pickup} to ${data.destination}: NGN ${formatNaira(data.amount)}. Review and pay to confirm your booking.`;

  if (data.phone) await sendSms(data.phone, body);
  if (data.push_token) await sendPush(data.push_token, title, body, { type: "rental_priced" });
  if (data.email) await sendEmail(data.email, title, `<p>${body}</p>`);

  await storeNotification(data.user_id, "rental_priced", title, body);
  return { message: "Rental priced notification sent" };
}

export async function sendRentalRejectedNotification(data: z.infer<typeof rentalRejectedSchema>) {
  const title = "Rental Request Declined";
  const body = `We're unable to accommodate your rental request for ${data.pickup} to ${data.destination}.`;

  if (data.phone) await sendSms(data.phone, body);
  if (data.push_token) await sendPush(data.push_token, title, body, { type: "rental_rejected" });
  if (data.email) await sendEmail(data.email, title, `<p>${body}</p>`);

  await storeNotification(data.user_id, "rental_rejected", title, body);
  return { message: "Rental rejected notification sent" };
}

export async function sendRentalConfirmedNotification(data: z.infer<typeof rentalConfirmedSchema>) {
  const title = "Rental Booking Confirmed! \u{1F389}";
  const body = `${data.pickup} to ${data.destination}: NGN ${formatNaira(data.amount)} paid. Have a comfortable trip!`;

  if (data.phone) await sendSms(data.phone, body);
  if (data.push_token) await sendPush(data.push_token, title, body, { type: "rental_confirmed" });
  if (data.email) await sendEmail(data.email, title, `<p>${body}</p>`);

  await storeNotification(data.user_id, "rental_confirmed", title, body);
  return { message: "Rental confirmed notification sent" };
}

export async function sendWaitlistNotification(data: z.infer<typeof waitlistNotificationSchema>) {
  // Python's str.split() with no args discards leading/trailing whitespace
  // and collapses runs of it; trim() + regex split matches that exactly.
  const firstName = data.full_name.trim().split(/\s+/)[0];
  const htmlBody = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
    <h1 style="color:#111827;font-size:24px;margin-bottom:8px;">You're on the list, ${firstName}! \u{1F389}</h1>
    <p style="color:#6b7280;font-size:16px;line-height:1.6;">
      Thanks for joining the <strong>Comfort Me</strong> waitlist. You're one step closer to a better commute.
    </p>
    <p style="color:#6b7280;font-size:16px;line-height:1.6;">
      We'll notify you as soon as we launch in your city. Early members get guaranteed seating and exclusive discounts.
    </p>
    <div style="margin:32px 0;">
      <a href="https://www.comfortmeng.com" style="background:#f97316;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
        Visit Our Website
      </a>
    </div>
    <p style="color:#9ca3af;font-size:13px;">
      You received this because you signed up at comfortmeng.com. No action needed.
    </p>
  </div>
  `;

  await sendEmail(data.email, "You're on the Comfort Me waitlist!", htmlBody);
  return { message: "Waitlist confirmation sent" };
}
