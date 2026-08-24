import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/http-errors";
import { addCard as addCardRecord } from "@/modules/cards/repository";
import {
  sendBookingCancelledNotification,
  sendBookingNotification,
  sendPaymentNotification,
  sendRentalConfirmedNotification,
  sendRentalRequestReceivedNotification,
} from "@/modules/notifications/service";
import { applyReferral } from "@/modules/rewards/repository";
import {
  chargeAuthorization,
  initializePayment,
  verifyPayment as verifyPaystackPayment,
} from "@/modules/payments/paystack";
import { deductWallet, fundWallet, verifyPin } from "@/modules/wallet/repository";
import {
  cancelBooking as cancelBookingRecord,
  createBookingsBulk,
  getBooking,
} from "@/modules/booking/repository/bookings";
import type { BookingSeatInput } from "@/modules/booking/repository/bookings";
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
  try {
    const result = await initializePayment({
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
    throw new ApiError(400, errMessage(err));
  }
}

// ---------- fund-wallet ----------

export async function fundWalletHub(data: FundWalletRequestInput) {
  const reference = randomUUID();

  if (data.payment_method === "wallet") {
    throw new ApiError(400, "Cannot fund wallet using wallet");
  }

  if (data.payment_method === "debit_card" && data.authorization_code) {
    // Charge saved card
    try {
      const result = await chargeAuthorization({
        authorization_code: data.authorization_code,
        email: data.email,
        amount: data.amount,
        reference,
      });
      if (result.status !== "success" && result.status !== "successful") {
        throw new ApiError(402, "Card charge failed");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) throw err;
      throw new ApiError(402, errMessage(err));
    }

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

  // For bank_transfer or card without auth_code — return Paystack initialize URL
  try {
    const result = await initializePayment({
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
  } else if (data.payment_method === "debit_card" && data.authorization_code) {
    // Saved card — charge immediately, then reserve seats atomically.
    try {
      const result = await chargeAuthorization({
        authorization_code: data.authorization_code,
        email: data.email,
        amount: finalAmount,
        reference,
      });
      if (result.status !== "success" && result.status !== "successful") {
        throw new ApiError(402, "Card charge failed");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) throw err;
      throw new ApiError(402, errMessage(err));
    }

    try {
      bookings = await createBookingsBulk(seatInputsFor("debit_card"));
    } catch {
      // Charge already succeeded — refund to wallet since seats couldn't be secured.
      await fundWallet({
        user_id: data.user_id,
        amount: finalAmount,
        description: "Refund: seats unavailable after card payment",
        reference,
      });
      throw new ApiError(409, "Seats unavailable — amount refunded to your wallet");
    }
  } else if (data.payment_method === "debit_card" || data.payment_method === "bank_transfer") {
    // New card or bank transfer — both go through Paystack's hosted
    // checkout (bank transfer has no "saved authorization" concept, so it
    // always takes this path); booking is created once payment verifies.
    try {
      const result = await initializePayment({
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

export async function cancelBookingHub(bookingId: number) {
  let booking;
  try {
    booking = await getBooking(bookingId);
  } catch {
    throw new ApiError(404, "Booking not found");
  }

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
  const deduction = Math.round(paid * CANCELLATION_DEDUCTION_RATE * 100) / 100;
  const refundAmount = Math.round((paid - deduction) * 100) / 100;
  const reference = randomUUID();

  if (refundAmount > 0) {
    await fundWallet({
      user_id: booking.user_id,
      amount: refundAmount,
      description: `Refund for cancelled booking #${bookingId} (10% cancellation fee deducted)`,
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
      await fundWallet({
        user_id: data.sender_user_id,
        amount: data.amount,
        description: "Refund: could not register package",
        reference,
      });
      throw new ApiError(400, `Could not register package, amount refunded: ${errMessage(err)}`);
    }
  } else if (data.payment_method === "debit_card" && data.authorization_code) {
    try {
      const result = await chargeAuthorization({
        authorization_code: data.authorization_code,
        email: data.email,
        amount: data.amount,
        reference,
      });
      if (result.status !== "success" && result.status !== "successful") {
        throw new ApiError(402, "Card charge failed");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) throw err;
      throw new ApiError(402, errMessage(err));
    }

    try {
      pkg = await createPackage(packagePayload);
    } catch (err) {
      await fundWallet({
        user_id: data.sender_user_id,
        amount: data.amount,
        description: "Refund: could not register package after card payment",
        reference,
      });
      throw new ApiError(400, `Could not register package, amount refunded: ${errMessage(err)}`);
    }
  } else if (data.payment_method === "debit_card") {
    // New card — Paystack checkout; package is created once payment verifies.
    try {
      const result = await initializePayment({
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

  // card / bank_transfer — Paystack checkout; rental is confirmed once payment verifies
  const reference = randomUUID();
  try {
    const result = await initializePayment({
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
    throw new ApiError(400, errMessage(err));
  }
}

// ---------- verify ----------
//
// The source wraps this ENTIRE function body — including the inner
// try/except blocks for the booking_payment and package_payment branches,
// which raise their own 409/400 HTTPExceptions — in one outer
// `except Exception`. Since Python's bare except catches HTTPException too
// (there's no more specific `except HTTPException` clause ahead of it),
// every inner exception gets re-caught and re-raised as a flat 400. This
// function replicates that: nothing internal ever surfaces as 409, only
// ever 200 or 400, no matter what "logically" happens inside.

export async function verifyPaymentHub(reference: string) {
  try {
    const result = await verifyPaystackPayment(reference);
    const metadata = (result.metadata ?? {}) as Record<string, unknown>;
    const response: Record<string, unknown> = { ...result };

    if (result.status === "success") {
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
        await addCardRecord({
          user_id: metadata.user_id as number,
          card_holder_name: "Card holder",
          last_four: result.last_four ?? "",
          card_type: (result.card_type as string) || "visa",
          expiry_month: result.exp_month ?? "",
          expiry_year: result.exp_year ?? "",
          bank_name: result.bank,
          paystack_auth_code: result.authorization_code,
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
          const contact = await notificationContact(userId);
          await sendBookingNotification({
            user_id: userId,
            amount: result.amount,
            reference,
            phone: contact.phone,
            email: contact.email,
            push_token: contact.push_token,
          });
          await rewardReferrerIfEligible(userId, "booking");
        } catch {
          // Payment already succeeded — refund to wallet since seats couldn't be secured.
          if (userId) {
            await fundWallet({
              user_id: userId,
              amount: result.amount,
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
          if (senderUserId) {
            await fundWallet({
              user_id: senderUserId,
              amount: result.amount,
              description: "Refund: could not register package after card payment",
              reference,
            });
          }
          throw new ApiError(400, "Could not register package — amount refunded to your wallet");
        }
      }
    }

    return response;
  } catch (err) {
    // Flattens ANY inner error (including the 409/400 ApiErrors thrown
    // above) to a 400 — see the comment on this function.
    throw new ApiError(400, errMessage(err));
  }
}
