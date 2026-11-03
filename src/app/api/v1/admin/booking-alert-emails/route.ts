import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { addBookingAlertEmail, listBookingAlertEmails } from "@/modules/notifications/repository";
import { bookingAlertEmailInputSchema } from "@/modules/notifications/validation";

// GET/POST /api/v1/admin/booking-alert-emails — the list of addresses that
// get an email every time a booking is made (see sendBookingAlert).
export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth(request, OPS_ROLES);
    const emails = await listBookingAlertEmails();
    return NextResponse.json(emails);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminAuth(request, OPS_ROLES);
    const { email } = bookingAlertEmailInputSchema.parse(await request.json());
    const created = await addBookingAlertEmail(email, Number(actor.sub));
    recordAuditLog(actor, request, "CREATE", "booking_alert_email", created.id, { email });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
