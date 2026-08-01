import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { sendRentalPricedNotification } from "@/modules/notifications/service";
import { rentalPricedSchema } from "@/modules/notifications/validation";

// POST /api/v1/notifications/rental-priced
export async function POST(request: NextRequest) {
  try {
    const data = rentalPricedSchema.parse(await request.json());
    const result = await sendRentalPricedNotification(data);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
