import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { sendRentalRejectedNotification } from "@/modules/notifications/service";
import { rentalRejectedSchema } from "@/modules/notifications/validation";

// POST /api/v1/notifications/rental-rejected
export async function POST(request: NextRequest) {
  try {
    const data = rentalRejectedSchema.parse(await request.json());
    const result = await sendRentalRejectedNotification(data);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
