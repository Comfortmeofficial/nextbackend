import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { sendRentalRequestReceivedNotification } from "@/modules/notifications/service";
import { rentalRequestReceivedSchema } from "@/modules/notifications/validation";

// POST /api/v1/notifications/rental-request-received
export async function POST(request: NextRequest) {
  try {
    const data = rentalRequestReceivedSchema.parse(await request.json());
    const result = await sendRentalRequestReceivedNotification(data);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
