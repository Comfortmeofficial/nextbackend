import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { createChatMessage, customerHasBookingOnRide, listChatMessages } from "@/modules/booking/repository/chat";
import { getRideRow } from "@/modules/booking/repository/rides";
import { parseBookingId } from "@/modules/booking/util";
import { chatMessageInputSchema } from "@/modules/booking/validation";
import type { ChatSenderType } from "@/modules/booking/types";

// Trip chat is the one shared surface where both a customer token
// (JWT_SECRET) and an admin token (ADMIN_JWT_SECRET, role bus_marshal) are
// both legitimate callers of the same route — so this resolves identity by
// trying admin verification first, then customer verification, rather than
// picking one token type like every other route in this API does.
const ADMIN_SECRET = process.env.ADMIN_JWT_SECRET || "change_me_in_production";

type Params = { params: Promise<{ id: string; userId: string }> };

async function resolveSender(
  request: NextRequest,
  rideId: number,
  threadUserId: number,
): Promise<ChatSenderType> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    throw new ApiError(401, "missing bearer token");
  }
  const token = header.slice("Bearer ".length);

  try {
    const decoded = jwt.verify(token, ADMIN_SECRET);
    if (typeof decoded !== "string" && decoded.role === "bus_marshal") {
      const ride = await getRideRow(rideId);
      if (!ride || ride.marshal_admin_id !== Number(decoded.sub)) {
        throw new ApiError(403, "You are not assigned to this ride");
      }
      return "marshal";
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // Not a valid admin token — fall through and try customer auth below.
  }

  const userId = requireCustomerAuth(request);
  if (userId !== threadUserId) {
    throw new ApiError(403, "You can only access your own trip chat");
  }
  const hasBooking = await customerHasBookingOnRide(rideId, userId);
  if (!hasBooking) {
    throw new ApiError(403, "You don't have a booking on this ride");
  }
  return "customer";
}

// GET /api/v1/rides/{id}/chat/{userId}/messages
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id, userId } = await params;
    const rideId = parseBookingId(id);
    if (typeof rideId !== "number") return rideId;
    const threadUserId = parseBookingId(userId);
    if (typeof threadUserId !== "number") return threadUserId;

    await resolveSender(request, rideId, threadUserId);
    const messages = await listChatMessages(rideId, threadUserId);
    return NextResponse.json(messages);
  } catch (error) {
    return handleRouteError(error);
  }
}

// POST /api/v1/rides/{id}/chat/{userId}/messages
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id, userId } = await params;
    const rideId = parseBookingId(id);
    if (typeof rideId !== "number") return rideId;
    const threadUserId = parseBookingId(userId);
    if (typeof threadUserId !== "number") return threadUserId;

    const senderType = await resolveSender(request, rideId, threadUserId);
    const { message } = chatMessageInputSchema.parse(await request.json());
    const created = await createChatMessage(rideId, threadUserId, senderType, message);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
