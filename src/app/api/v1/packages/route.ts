import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { createPackage, listPackagesBySender } from "@/modules/booking/repository/packages";
import { packageInputSchema } from "@/modules/booking/validation";

// POST /api/v1/packages — created only by payment_hub after a successful
// charge (mirrors how Bookings are only ever created post-payment); there's
// deliberately no unauthenticated "create then pay later" path here, unlike
// Rentals.
export async function POST(request: NextRequest) {
  try {
    const input = packageInputSchema.parse(await request.json());
    const pkg = await createPackage({
      rideId: input.ride_id,
      senderUserId: input.sender_user_id,
      recipientName: input.recipient_name,
      recipientPhone: input.recipient_phone,
      dropOffNote: input.drop_off_note,
      fareAmount: input.fare_amount,
    });
    return NextResponse.json(pkg, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

// GET /api/v1/packages?sender_user_id= — the sender-facing view ("packages
// I've sent").
export async function GET(request: NextRequest) {
  try {
    const senderId = Number(request.nextUrl.searchParams.get("sender_user_id") ?? "0") || 0;
    if (!senderId) {
      throw new ApiError(400, "sender_user_id is required");
    }
    const items = await listPackagesBySender(senderId);
    return NextResponse.json(items);
  } catch (error) {
    return handleRouteError(error);
  }
}
