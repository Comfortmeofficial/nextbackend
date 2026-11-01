import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/http-errors";

// verifyPaymentHub's outer catch deliberately flattens every internal error
// to a 400, matching the legacy service's bug-for-bug behavior (see the
// comment above that function). The ownership check added there is new,
// not a legacy behavior to preserve — a client needs to see a real 403 to
// tell "this payment isn't yours" apart from "verification failed", so this
// marker type lets the catch block re-throw it unflattened while every
// other internal error still flattens to 400 as before.
class OwnershipError extends ApiError {
  constructor(detail: string) {
    super(403, detail);
  }
}
import { addCard as addCardRecord, getCardForUser } from "@/modules/cards/repository";
import {
  sendBookingCancelledNotification,
  sendBookingNotification,
  sendPaymentNotification,
  sendRentalConfirmedNotification,
  sendRentalRequestReceivedNotification,
} from "@/modules/notifications/service";
import { applyReferral } from "@/modules/rewards/repository";
import {
  chargeSavedCard,
  getActiveGateway,
  initializeWithGateway,
  verifyByReference,
} from "@/modules/payments/gateway";
import {
  attachPaymentBooking,
  createPayment,
  getPaymentByReference,
  markPaymentFailed,
  markPaymentSuccessful,
} from "@/modules/payments/repository";
import type { PaymentGateway, VerifyPaymentResult } from "@/modules/payments/types";
import { deductWallet, fundWallet, verifyPin } from "@/modules/wallet/repository";
import {
  cancelBooking as cancelBookingRecord,
  createBookingsBulk,
  getBooking,
} from "@/modules/booking/repository/bookings";
import type { BookingSeatInput } from "@/modules/booking/repository/bookings";
import type { BookingDto } from "@/modules/booking/types";
import { createPackage } from "@/modules/booking/repository/packages";
import { createRental, getRental, updateRentalStatus } from "@/modules/booking/repository/rentals";
import {
  CANCELLATION_DEDUCTION_RATE,
  CARD_VERIFICATION_AMOUNT,
  RENTAL_PAYMENT_METHOD,
  notificationContact,
  rewardReferrerIfEligible,
} from "./helpers";
import type {
  AddCardRequestInput,
  BookingLegInput,
  FundWalletRequestInput,
  PayBookingRequestInput,
  PayPackageRequestInput,
  PayRentalRequestInput,
  RequestRentalRequestInput,
} from "./validation";

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Groups freshly-created bookings by ride into the confirmation email's
// per-leg breakdown — more than one entry only when the purchase spans
// multiple rides (a return trip or a multi-day booking).
function summarizeBookingLegs(bookings: BookingDto[]) {
  const byRide = new Map<
    number,
    {
      location_name: string;
      destination_name: string;
      departure_time: string;
      seat_numbers: string[];
      bus_plate: string | null;
      fare: number;
      tickets: { booking_id: number; reference: string; seat_number: string }[];
    }
  >();
  for (const b of bookings) {
    const existing = byRide.get(b.ride_id);
    const ticket = { booking_id: b.id, reference: b.reference, seat_number: b.seat_number };
    if (existing) {
      existing.seat_numbers.push(b.seat_number);
      existing.fare += b.final_amount;
      existing.tickets.push(ticket);
    } else {
      byRide.set(b.ride_id, {
        location_name: b.ride.route.location.name,
        destination_name: b.ride.route.destination.name,
        departure_time: b.ride.departure_time,
        bus_plate: b.ride.bus_plate,
        seat_numbers: [b.seat_number],
        fare: b.final_amount,
        tickets: [ticket],
      });
    }
  }
  return Array.from(byRide.values());
}

// Verifies a wallet PIN the same loose way the source does: it only ever
// checks whether the downstream call returned HTTP 200, collapsing every
// failure reason (wrong PIN, no PIN set at all, no wallet at all) into the
// same "Incorrect wallet PIN" message — not the more specific messages the
// wallet module itself would raise.
async function verifyWalletPinOrThrow(userId: number, pin: string): Promise<void> {
  let valid: boolean;
  try {
    valid = await verifyPin(userId, pin);
  } catch {
    throw new ApiError(400, "Incorrect wallet PIN");
  }
  if (!valid) {
    throw new ApiError(400, "Incorrect wallet PIN");
  }
}

// ---------- add-card ----------

export async function addCard(data: AddCardRequestInput) {
  const reference = randomUUID();
  const gateway = await getActiveGateway();
  // The ₦50 verification charge is a real payment attempt, so it gets a
  // ledger row like any other — this is also how processPaymentResult's
  // add_card branch later knows which gateway minted the resulting token.
  await createPayment({
    reference,
    user_id: data.user_id,
    amount: CARD_VERIFICATION_AMOUNT,
    purpose: "other",
    payment_method: "debit_card",
    gateway,
  });
  try {
    const result = await initializeWithGateway(gateway, {
      amount: CARD_VERIFICATION_AMOUNT,
      email: data.email,
      reference,
      callback_url: data.callback_url,
      metadata: { user_id: data.user_id, purpose: "add_card" },
    });
    return {
      success: true,
      authorization_url: result.authorization_url,
      reference: result.reference,
    };
  } catch (err) {
    await markPaymentFailed(reference, errMessage(err));
    throw new ApiError(400, errMessage(err));
  }
}

// ---------- fund-wallet ----------

export async function fundWalletHub(data: FundWalletRequestInput) {
  const reference = randomUUID();

  if (data.payment_method === "wallet") {
    throw new ApiError(400, "Cannot fund wallet using wallet");
  }

  const savedCard =
    data.payment_method === "debit_card" && data.card_id
      ? await getCardForUser(data.card_id, data.user_id)
      : null;
  if (data.card_id && !savedCard) {
    throw new ApiError(404, "Card not found");
  }
  // A saved card is always re-charged through the gateway that originally
  // minted its token, regardless of which gateway is currently active.
  const gateway: PaymentGateway = savedCard?.gateway ?? (await getActiveGateway());

  await createPayment({
    reference,
    user_id: data.user_id,
    amount: data.amount,
    purpose: "wallet_funding",
    payment_method: data.payment_method,
    gateway,
  });

  if (savedCard) {
    // Charge saved card
    try {
      const result = await chargeSavedCard(savedCard, { email: data.email, amount: data.amount, reference });
      if (result.status !== "success" && result.status !== "successful") {
        await markPaymentFailed(reference, result.gateway_response ?? "Card charge failed");
        throw new ApiError(402, "Card charge failed");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) throw err;
      await markPaymentFailed(reference, errMessage(err));
      throw new ApiError(402, errMessage(err));
    }

    await markPaymentSuccessful(reference);

    // Credit wallet
    await fundWallet({
      user_id: data.user_id,
      amount: data.amount,
      description: "Wallet funding via card",
      reference,
    });

    const contact = await notificationContact(data.user_id);
    await sendPaymentNotification({
      user_id: data.user_id,
      amount: data.amount,
      type: "wallet_funded",
      reference,
      phone: contact.phone,
      email: contact.email,
      push_token: contact.push_token,
    });

    await rewardReferrerIfEligible(data.user_id, "wallet_funding", data.amount);

    return {
      success: true,
      message: "Wallet funded successfully",
      reference,
      amount: data.amount,
    };
  }

  // For bank_transfer or card without a saved card — return a hosted checkout URL
  try {
    const result = await initializeWithGateway(gateway, {
      amount: data.amount,
      email: data.email,
      reference,
      callback_url: data.callback_url,
      metadata: { user_id: data.user_id, purpose: "wallet_funding" },
    });
    return {
      success: true,
      message: "Payment initialized",
      authorization_url: result.authorization_url,
      reference: result.reference,
    };
  } catch (err) {
    await markPaymentFailed(reference, errMessage(err));
    throw new ApiError(400, errMessage(err));
  }
}

// ---------- pay-booking ----------

export async function payBooking(data: PayBookingRequestInput) {
  // `legs` lets one payment cover bookings across multiple different rides
  // (a return trip, or a multi-day itinerary); the original single-ride
  // shape is normalized into a one-element legs array so the rest of this
  // function only has to handle the general case.
  const legs: BookingLegInput[] =
    data.legs && data.legs.length > 0
      ? data.legs
      : [{ ride_id: data.ride_id!, seat_numbers: data.seat_numbers!, pickup_stop_id: data.pickup_stop_id ?? null }];

  if (legs.some((leg) => !leg.seat_numbers.length)) {
    throw new ApiError(400, "At least one seat must be selected");
  }

  const reference = randomUUID();
  const seatCount = legs.reduce((sum, leg) => sum + leg.seat_numbers.length, 0);
  const rideDescription =
    legs.length === 1
      ? `ride #${legs[0].ride_id}`
      : `${legs.length} rides (#${legs.map((l) => l.ride_id).join(", #")})`;

  // Apply coupon discount — non-blocking, matching the source's bare
  // `except Exception: pass`.
  let discount = 0;
  if (data.coupon_code) {
    try {
      const rewardResp = await applyReferral({
        code: data.coupon_code,
        amount: data.amount,
        user_id: data.user_id,
      });
      discount = rewardResp.discount_amount ?? 0;
    } catch {
      // coupon failure is non-blocking
    }
  }

  const finalAmount = Math.max(data.amount - discount, 0);
  const farePerSeat = data.amount / seatCount;
  const discountPerSeat = discount / seatCount;

  const seatInputsFor = (paymentMethod: BookingSeatInput["paymentMethod"]): BookingSeatInput[] =>
    legs.flatMap((leg) =>
      leg.seat_numbers.map((s) => ({
        userId: data.user_id,
        rideId: leg.ride_id,
        seatNumber: s,
        amount: farePerSeat,
        discountAmount: discountPerSeat,
        finalAmount: farePerSeat - discountPerSeat,
        couponCode: data.coupon_code || "",
        groupReference: reference,
        paymentMethod,
        pickupStopId: leg.pickup_stop_id ?? null,
      })),
    );

  let bookings;

  if (data.payment_method === "wallet") {
    if (!data.wallet_pin) {
      throw new ApiError(400, "wallet_pin is required for wallet payment");
    }
    await verifyWalletPinOrThrow(data.user_id, data.wallet_pin);

    // Reserve every seat in one atomic transaction before charging anything
    // — if any seat is unavailable, nothing is booked and no money moves.
    try {
      bookings = await createBookingsBulk(seatInputsFor("wallet"));
    } catch {
      throw new ApiError(409, "One or more selected seats are no longer available");
    }

    // Deduct total from wallet; if this fails, release the seats we just
    // reserved instead of leaving them held with no payment.
    try {
      await deductWallet({
        user_id: data.user_id,
        amount: finalAmount,
        type: "trip_fare",
        description: `Trip fare for ${seatCount} seat(s) on ${rideDescription}`,
        reference,
      });
    } catch (err) {
      for (const booking of bookings) {
        try {
          await cancelBookingRecord(booking.id);
        } catch {
          // best-effort seat release
        }
      }
      throw new ApiError(402, `Payment failed, seats released: ${errMessage(err)}`);
    }
  } else if (data.payment_method === "debit_card" && data.card_id) {
    // Saved card — charge immediately, then reserve seats atomically.
    const savedCard = await getCardForUser(data.card_id, data.user_id);
    if (!savedCard) {
      throw new ApiError(404, "Card not found");
    }
    await createPayment({
      reference,
      user_id: data.user_id,
      amount: finalAmount,
      purpose: "booking_payment",
      payment_method: "debit_card",
      gateway: savedCard.gateway,
    });

    try {
      const result = await chargeSavedCard(savedCard, { email: data.email, amount: finalAmount, reference });
      if (result.status !== "success" && result.status !== "successful") {
        await markPaymentFailed(reference, result.gateway_response ?? "Card charge failed");
        throw new ApiError(402, "Card charge failed");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) throw err;
      await markPaymentFailed(reference, errMessage(err));
      throw new ApiError(402, errMessage(err));
    }

    // The gateway has now actually been paid, independent of whether a booking
    // ends up existing — see attachPaymentBooking below for why booking_id
    // is attached separately rather than passed to markPaymentSuccessful.
    await markPaymentSuccessful(reference);

    try {
      bookings = await createBookingsBulk(seatInputsFor("debit_card"));
      await attachPaymentBooking(reference, bookings[0].id);
    } catch {
      // Charge already succeeded — refund to wallet since seats couldn't be secured.
      // Refunds aren't tracked in `payments` (only in the wallet's own
      // ledger) — Payments is deliberately just "what came in via Paystack".
      await fundWallet({
        user_id: data.user_id,
        amount: finalAmount,
        type: "refund",
        description: "Refund: seats unavailable after card payment",
        reference,
      });
      throw new ApiError(409, "Seats unavailable — amount refunded to your wallet");
    }
  } else if (data.payment_method === "debit_card" || data.payment_method === "bank_transfer") {
    // New card or bank transfer — both go through the active gateway's
    // hosted checkout (bank transfer has no "saved authorization" concept,
    // so it always takes this path); booking is created once payment
    // verifies.
    const gateway = await getActiveGateway();
    await createPayment({
      reference,
      user_id: data.user_id,
      amount: finalAmount,
      purpose: "booking_payment",
      payment_method: data.payment_method,
      gateway,
    });
    try {
      const result = await initializeWithGateway(gateway, {
        amount: finalAmount,
        email: data.email,
        reference,
        callback_url: data.callback_url,
        metadata: {
          purpose: "booking_payment",
          user_id: data.user_id,
          payment_method: data.payment_method,
          legs,
          fare_per_seat: farePerSeat,
          discount_per_seat: discountPerSeat,
          coupon_code: data.coupon_code || "",
        },
      });
      return {
        success: true,
        message: "Payment initialized",
        authorization_url: result.authorization_url,
        reference: result.reference,
      };
    } catch (err) {
      await markPaymentFailed(reference, errMessage(err));
      throw new ApiError(400, errMessage(err));
    }
  } else {
    throw new ApiError(400, "Unsupported payment method");
  }

  const contact = await notificationContact(data.user_id);
  await sendBookingNotification({
    user_id: data.user_id,
    amount: finalAmount,
    reference,
    legs: summarizeBookingLegs(bookings),
    phone: contact.phone,
    email: contact.email,
    push_token: contact.push_token,
  });

  await rewardReferrerIfEligible(data.user_id, "booking");

  return {
    success: true,
    message: `Booking confirmed for ${seatCount} seat(s)`,
    reference,
    amount: finalAmount,
    discount,
    booking_id: bookings[0].id,
  };
}

// ---------- cancel-booking ----------

// Shared by both entry points below — the only thing that differs between a
// customer choosing to cancel their own trip and an admin cancelling one on
// the platform's behalf (its route/schedule was removed, say) is whether
// the 10% cancellation fee applies. Everything else — releasing the seat,
// crediting the refund to the wallet, notifying the customer — is
// identical either way.
async function cancelBookingAndRefund(booking: BookingDto, deductionRate: number) {
  const bookingId = booking.id;

  if (booking.status === "cancelled") {
    throw new ApiError(400, "Booking is already cancelled");
  }
  if (booking.status === "completed") {
    throw new ApiError(400, "Completed bookings cannot be cancelled");
  }

  try {
    await cancelBookingRecord(bookingId);
  } catch (err) {
    throw new ApiError(400, errMessage(err));
  }

  const paid = booking.final_amount || 0;
  const deduction = Math.round(paid * deductionRate * 100) / 100;
  const refundAmount = Math.round((paid - deduction) * 100) / 100;
  const reference = randomUUID();

  if (refundAmount > 0) {
    // Refunds aren't tracked in `payments` — only in the wallet's own
    // ledger. Payments is deliberately just "what came in via the gateway".
    await fundWallet({
      user_id: booking.user_id,
      amount: refundAmount,
      type: "refund",
      description:
        deduction > 0
          ? `Refund for cancelled booking #${bookingId} (10% cancellation fee deducted)`
          : `Refund for cancelled booking #${bookingId}`,
      reference,
    });
  }

  try {
    const contact = await notificationContact(booking.user_id);
    await sendBookingCancelledNotification({
      user_id: booking.user_id,
      reference,
      refund_amount: refundAmount,
      deduction,
      phone: contact.phone,
      email: contact.email,
      push_token: contact.push_token,
    });
  } catch {
    // notification failure shouldn't block the cancellation itself
  }

  return {
    success: true,
    message: "Booking cancelled",
    reference,
    amount_paid: paid,
    deduction,
    refund_amount: refundAmount,
  };
}

export async function cancelBookingHub(bookingId: number, requestingUserId: number) {
  let booking;
  try {
    booking = await getBooking(bookingId);
  } catch {
    throw new ApiError(404, "Booking not found");
  }

  if (booking.user_id !== requestingUserId) {
    throw new ApiError(403, "Not your booking");
  }

  return cancelBookingAndRefund(booking, CANCELLATION_DEDUCTION_RATE);
}

// Admin-initiated cancellation for when it's the platform's fault, not the
// customer's (its route or schedule was removed, say) — refunds the full
// amount, no cancellation fee, no ownership check (an admin can cancel any
// booking this way). Deliberately separate from DELETE /api/v1/bookings/
// {id} (cancelBooking/cancelBookingRecord), which stays a zero-refund,
// no-notification cancel for when a refund genuinely isn't warranted (a
// no-show, fraud, correcting a mistake) — this is only for "we're
// cancelling your otherwise-valid trip through no fault of your own."
export async function adminCancelBookingWithRefund(bookingId: number) {
  let booking;
  try {
    booking = await getBooking(bookingId);
  } catch {
    throw new ApiError(404, "Booking not found");
  }

  return cancelBookingAndRefund(booking, 0);
}

// ---------- pay-package ----------
//
// Pays for sending a package along an existing ride, creating the Package
// row only after the charge succeeds — same payment-then-create ordering as
// pay-booking.

export async function payPackage(data: PayPackageRequestInput) {
  const reference = randomUUID();
  const packagePayload = {
    rideId: data.ride_id,
    senderUserId: data.sender_user_id,
    recipientName: data.recipient_name,
    recipientPhone: data.recipient_phone,
    dropOffNote: data.drop_off_note || "",
    fareAmount: data.amount,
  };

  let pkg;

  if (data.payment_method === "wallet") {
    if (!data.wallet_pin) {
      throw new ApiError(400, "wallet_pin is required for wallet payment");
    }
    await verifyWalletPinOrThrow(data.sender_user_id, data.wallet_pin);

    try {
      // The source sends an invalid wallet transaction type here
      // ("package_fee", which isn't in wallet_service's TransactionType
      // enum), so this call always failed in production. Fixed to
      // "trip_fare" per explicit direction — see project notes.
      await deductWallet({
        user_id: data.sender_user_id,
        amount: data.amount,
        type: "trip_fare",
        description: `Package delivery fee for ride #${data.ride_id}`,
        reference,
      });
    } catch (err) {
      throw new ApiError(402, `Payment failed: ${errMessage(err)}`);
    }

    try {
      pkg = await createPackage(packagePayload);
    } catch (err) {
      // Charge already succeeded — refund since the package couldn't be created.
      // Refunds aren't tracked in `payments` — only in the wallet's own ledger.
      await fundWallet({
        user_id: data.sender_user_id,
        amount: data.amount,
        type: "refund",
        description: "Refund: could not register package",
        reference,
      });
      throw new ApiError(400, `Could not register package, amount refunded: ${errMessage(err)}`);
    }
  } else if (data.payment_method === "debit_card" && data.card_id) {
    const savedCard = await getCardForUser(data.card_id, data.sender_user_id);
    if (!savedCard) {
      throw new ApiError(404, "Card not found");
    }
    await createPayment({
      reference,
      user_id: data.sender_user_id,
      amount: data.amount,
      purpose: "package_payment",
      payment_method: "debit_card",
      gateway: savedCard.gateway,
    });

    try {
      const result = await chargeSavedCard(savedCard, { email: data.email, amount: data.amount, reference });
      if (result.status !== "success" && result.status !== "successful") {
        await markPaymentFailed(reference, result.gateway_response ?? "Card charge failed");
        throw new ApiError(402, "Card charge failed");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) throw err;
      await markPaymentFailed(reference, errMessage(err));
      throw new ApiError(402, errMessage(err));
    }

    await markPaymentSuccessful(reference);

    try {
      pkg = await createPackage(packagePayload);
    } catch (err) {
      // Refunds aren't tracked in `payments` — only in the wallet's own ledger.
      await fundWallet({
        user_id: data.sender_user_id,
        amount: data.amount,
        type: "refund",
        description: "Refund: could not register package after card payment",
        reference,
      });
      throw new ApiError(400, `Could not register package, amount refunded: ${errMessage(err)}`);
    }
  } else if (data.payment_method === "debit_card") {
    // New card — hosted checkout; package is created once payment verifies.
    const gateway = await getActiveGateway();
    await createPayment({
      reference,
      user_id: data.sender_user_id,
      amount: data.amount,
      purpose: "package_payment",
      payment_method: "debit_card",
      gateway,
    });
    try {
      const result = await initializeWithGateway(gateway, {
        amount: data.amount,
        email: data.email,
        reference,
        callback_url: data.callback_url,
        metadata: { purpose: "package_payment", ...packagePayload },
      });
      return {
        success: true,
        message: "Payment initialized",
        authorization_url: result.authorization_url,
        reference: result.reference,
      };
    } catch (err) {
      await markPaymentFailed(reference, errMessage(err));
      throw new ApiError(400, errMessage(err));
    }
  } else {
    throw new ApiError(400, "Unsupported payment method");
  }

  const contact = await notificationContact(data.sender_user_id);
  await sendPaymentNotification({
    user_id: data.sender_user_id,
    amount: data.amount,
    type: "package_payment",
    reference,
    phone: contact.phone,
    email: contact.email,
    push_token: contact.push_token,
  });

  return {
    success: true,
    message: "Package registered",
    reference,
    amount: data.amount,
    package: pkg,
  };
}

// ---------- request-rental ----------

export async function requestRental(data: RequestRentalRequestInput) {
  let rental;
  try {
    rental = await createRental({
      userId: data.user_id,
      pickup: data.pickup,
      destination: data.destination,
      eventType: data.event_type,
      pickupDate: data.pickup_date,
      pickupTime: data.pickup_time,
      phone: data.phone,
      notes: data.notes || "",
      isRoundTrip: data.is_round_trip,
      returnDate: data.return_date || "",
      returnTime: data.return_time || "",
      passengerCount: data.passenger_count ?? null,
      duration: data.duration ?? null,
      paymentMethod: "",
    });
  } catch (err) {
    throw new ApiError(400, errMessage(err));
  }

  try {
    const contact = await notificationContact(data.user_id);
    await sendRentalRequestReceivedNotification({
      user_id: data.user_id,
      rental_id: rental.id,
      pickup: data.pickup,
      destination: data.destination,
      phone: contact.phone,
      email: contact.email,
      push_token: contact.push_token,
    });
  } catch {
    // notification failure shouldn't block the request itself
  }

  return { success: true, message: "Rental request submitted", rental };
}

// ---------- pay-rental ----------
//
// Pays for a rental that an admin has already priced (status=awaiting_payment).

export async function payRental(data: PayRentalRequestInput) {
  let rental;
  try {
    rental = await getRental(data.rental_id);
  } catch {
    throw new ApiError(404, "Rental not found");
  }

  if (rental.status !== "awaiting_payment") {
    throw new ApiError(400, "This rental is not awaiting payment");
  }

  const amount = rental.amount;

  if (data.payment_method === "wallet") {
    if (!data.wallet_pin) {
      throw new ApiError(400, "wallet_pin is required for wallet payment");
    }
    await verifyWalletPinOrThrow(data.user_id, data.wallet_pin);

    const reference = randomUUID();
    try {
      // Same wallet-transaction-type fix as pay-package: the source's
      // "rental_fee" type isn't in wallet_service's enum, so this call
      // always failed in production. Fixed to "trip_fare".
      await deductWallet({
        user_id: data.user_id,
        amount,
        type: "trip_fare",
        description: `Bus rental: ${rental.pickup} to ${rental.destination}`,
        reference,
      });
      await updateRentalStatus(data.rental_id, "confirmed", RENTAL_PAYMENT_METHOD.wallet);
    } catch (err) {
      throw new ApiError(400, errMessage(err));
    }

    try {
      const contact = await notificationContact(data.user_id);
      await sendRentalConfirmedNotification({
        user_id: data.user_id,
        rental_id: data.rental_id,
        pickup: rental.pickup,
        destination: rental.destination,
        amount,
        phone: contact.phone,
        email: contact.email,
        push_token: contact.push_token,
      });
    } catch {
      // best-effort
    }

    return { success: true, message: "Rental payment successful", reference, amount };
  }

  // card / bank_transfer — hosted checkout; rental is confirmed once payment verifies
  const reference = randomUUID();
  const gateway = await getActiveGateway();
  await createPayment({
    reference,
    user_id: data.user_id,
    amount,
    purpose: "rental_payment",
    payment_method: data.payment_method,
    gateway,
  });
  try {
    const result = await initializeWithGateway(gateway, {
      amount,
      email: data.email,
      reference,
      callback_url: data.callback_url,
      metadata: {
        purpose: "rental_payment",
        rental_id: data.rental_id,
        user_id: data.user_id,
        payment_method: RENTAL_PAYMENT_METHOD[data.payment_method],
      },
    });
    return {
      success: true,
      message: "Payment initialized",
      authorization_url: result.authorization_url,
      reference: result.reference,
    };
  } catch (err) {
    await markPaymentFailed(reference, errMessage(err));
    throw new ApiError(400, errMessage(err));
  }
}

// ---------- verify ----------

// Shared between the client-triggered verify endpoint (verifyPaymentHub,
// below) and the Paystack webhook — "what a payment confirmation actually
// does" needs exactly one implementation, not two that can silently drift.
// Ownership (does this payment belong to the caller) is checked by
// verifyPaymentHub before calling this; the webhook has no "caller" to check
// against — it's already authenticated by its HMAC signature instead.
//
// Idempotent by construction: if the payments row for this reference is no
// longer PENDING — the webhook and the client's own verify call can both
// reach here for the same payment, in either order — none of the side
// effects below run again, which matters beyond just the DB row: it also
// stops a booking/package being created twice or a notification being
// re-sent for a payment that's already been fully handled.
export async function processPaymentResult(
  reference: string,
  result: VerifyPaymentResult,
): Promise<Record<string, unknown>> {
  const metadata = (result.metadata ?? {}) as Record<string, unknown>;
  const response: Record<string, unknown> = { ...result };

  const payment = await getPaymentByReference(reference);
  if (payment && payment.status !== "pending") {
    // A second caller racing the first (the webhook beating the client's
    // own verify call back from the redirect, or vice versa) must still
    // report the real booking_id — otherwise whichever caller loses the
    // race sees a response with no booking_id and treats a successful,
    // already-booked payment as a failure. booking_id only ever lives on
    // `response` via the booking_payment branch below, which this early
    // return skips entirely, so it has to be pulled from the payment row
    // itself (set once, by whichever call actually ran that branch first).
    return { ...response, booking_id: payment.booking_id ?? undefined, already_processed: true };
  }

  if (result.status === "success") {
    // Marked successful up front, before any purpose-specific business step
    // — this reflects whether Paystack was actually paid, independent of
    // whatever happens next (a booking/package can still fail to be created
    // afterward and get refunded; the payment itself still succeeded).
    await markPaymentSuccessful(reference);

    const purpose = metadata.purpose;

    if (purpose === "wallet_funding") {
        const userId = metadata.user_id as number | undefined;
        if (userId) {
          await fundWallet({
            user_id: userId,
            amount: result.amount,
            description: "Wallet funding via bank transfer",
            reference,
          });
          const contact = await notificationContact(userId);
          await sendPaymentNotification({
            user_id: userId,
            amount: result.amount,
            type: "wallet_funded",
            reference,
            phone: contact.phone,
            email: contact.email,
            push_token: contact.push_token,
          });
          await rewardReferrerIfEligible(userId, "wallet_funding", result.amount);
        }
      } else if (purpose === "add_card" && result.authorization_code) {
        // Store the reusable token under whichever column matches the
        // gateway this payment actually used — `payment` (looked up above
        // for the idempotency check) already carries it.
        const cardGateway = payment?.gateway ?? "paystack";
        await addCardRecord({
          user_id: metadata.user_id as number,
          card_holder_name: "Card holder",
          last_four: result.last_four ?? "",
          card_type: (result.card_type as string) || "visa",
          expiry_month: result.exp_month ?? "",
          expiry_year: result.exp_year ?? "",
          bank_name: result.bank,
          gateway: cardGateway,
          paystack_auth_code: cardGateway === "paystack" ? result.authorization_code : null,
          flutterwave_token: cardGateway === "flutterwave" ? result.authorization_code : null,
        });
      } else if (purpose === "rental_payment") {
        const rentalId = metadata.rental_id as number;
        const userId = metadata.user_id as number;
        const paymentMethod = metadata.payment_method as "wallet" | "card" | "bank";
        const rental = await updateRentalStatus(rentalId, "confirmed", paymentMethod);
        const contact = await notificationContact(userId);
        await sendRentalConfirmedNotification({
          user_id: userId,
          rental_id: rentalId,
          pickup: rental.pickup,
          destination: rental.destination,
          amount: result.amount,
          phone: contact.phone,
          email: contact.email,
          push_token: contact.push_token,
        });
      } else if (purpose === "booking_payment") {
        const userId = metadata.user_id as number;
        // New metadata carries `legs` (possibly spanning multiple rides);
        // fall back to the pre-existing single-ride shape for any payment
        // initialized before this field existed.
        const legs =
          (metadata.legs as
            | { ride_id: number; seat_numbers: string[]; pickup_stop_id?: number | null }[]
            | undefined) ??
          [
            {
              ride_id: metadata.ride_id as number,
              seat_numbers: (metadata.seat_numbers as string[]) ?? [],
              pickup_stop_id: null,
            },
          ];
        const paymentMethod = metadata.payment_method === "bank_transfer" ? "bank_transfer" : "debit_card";
        const farePerSeat = (metadata.fare_per_seat as number) ?? 0;
        const discountPerSeat = (metadata.discount_per_seat as number) ?? 0;
        const couponCode = (metadata.coupon_code as string) ?? "";
        try {
          const bookings = await createBookingsBulk(
            legs.flatMap((leg) =>
              leg.seat_numbers.map((s) => ({
                userId,
                rideId: leg.ride_id,
                seatNumber: s,
                amount: farePerSeat,
                discountAmount: discountPerSeat,
                finalAmount: farePerSeat - discountPerSeat,
                couponCode,
                groupReference: reference,
                paymentMethod,
                pickupStopId: leg.pickup_stop_id ?? null,
              })),
            ),
          );
          response.booking_id = bookings[0].id;
          await attachPaymentBooking(reference, bookings[0].id);
          const contact = await notificationContact(userId);
          await sendBookingNotification({
            user_id: userId,
            amount: result.amount,
            reference,
            legs: summarizeBookingLegs(bookings),
            phone: contact.phone,
            email: contact.email,
            push_token: contact.push_token,
          });
          await rewardReferrerIfEligible(userId, "booking");
        } catch {
          // Payment already succeeded — refund to wallet since seats couldn't be secured.
          // Refunds aren't tracked in `payments` — only in the wallet's own ledger.
          if (userId) {
            await fundWallet({
              user_id: userId,
              amount: result.amount,
              type: "refund",
              description: "Refund: seats unavailable after card payment",
              reference,
            });
          }
          throw new ApiError(409, "Seats unavailable — amount refunded to your wallet");
        }
      } else if (purpose === "package_payment") {
        const senderUserId = metadata.sender_user_id as number;
        try {
          const pkg = await createPackage({
            rideId: metadata.ride_id as number,
            senderUserId,
            recipientName: metadata.recipient_name as string,
            recipientPhone: metadata.recipient_phone as string,
            dropOffNote: (metadata.drop_off_note as string) ?? "",
            fareAmount: metadata.fare_amount as number,
          });
          response.package = pkg;
          const contact = await notificationContact(senderUserId);
          await sendPaymentNotification({
            user_id: senderUserId,
            amount: result.amount,
            type: "package_payment",
            reference,
            phone: contact.phone,
            email: contact.email,
            push_token: contact.push_token,
          });
        } catch {
          // Refunds aren't tracked in `payments` — only in the wallet's own ledger.
          if (senderUserId) {
            await fundWallet({
              user_id: senderUserId,
              amount: result.amount,
              type: "refund",
              description: "Refund: could not register package after card payment",
              reference,
            });
          }
          throw new ApiError(400, "Could not register package — amount refunded to your wallet");
        }
      }
    } else {
      await markPaymentFailed(reference, result.gateway_response ?? null);
    }

  return response;
}



// The source wraps this ENTIRE function body — including the inner
// try/except blocks for the booking_payment and package_payment branches,
// which raise their own 409/400 HTTPExceptions — in one outer
// `except Exception`. Since Python's bare except catches HTTPException too
// (there's no more specific `except HTTPException` clause ahead of it),
// every inner exception gets re-caught and re-raised as a flat 400. This
// function replicates that: nothing internal ever surfaces as 409, only
// ever 200 or 400, no matter what "logically" happens inside
// processPaymentResult. The webhook (which also calls processPaymentResult)
// does NOT flatten the same way — see its own comment for why.
export async function verifyPaymentHub(reference: string, requestingUserId: number) {
  try {
    const result = await verifyByReference(reference);
    const metadata = (result.metadata ?? {}) as Record<string, unknown>;
    const metadataUserId = metadata.user_id as number | undefined;
    if (metadataUserId !== undefined && metadataUserId !== requestingUserId) {
      throw new OwnershipError("Not your payment");
    }
    return await processPaymentResult(reference, result);
  } catch (err) {
    if (err instanceof OwnershipError) throw err;
    // Flattens ANY other inner error (including the 409/400 ApiErrors
    // processPaymentResult can throw) to a 400 — see the comment above.
    throw new ApiError(400, errMessage(err));
  }
}
