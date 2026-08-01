import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { sendRentalConfirmedNotification } from "@/modules/notifications/service";
import { rentalConfirmedSchema } from "@/modules/notifications/validation";

// POST /api/v1/notifications/rental-confirmed
export async function POST(request: NextRequest) {
  try {
    const data = rentalConfirmedSchema.parse(await request.json());
    const result = await sendRentalConfirmedNotification(data);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
