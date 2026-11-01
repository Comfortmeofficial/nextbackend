import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { idParamSchema } from "@/lib/common-validation";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { adminCancelBookingWithRefund } from "@/modules/paymentHub/service";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/payment-hub/admin-cancel-booking/{booking_id} — a full,
// no-fee refund for when the platform is cancelling a customer's valid
// booking (its route/schedule was removed, say), not the customer. See
// adminCancelBookingWithRefund for why this is deliberately separate from
// the plain DELETE /api/v1/bookings/{id} path, which still does zero
// refund by design for cancellations that aren't the platform's fault.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const actor = await requireAdminAuth(request, OPS_ROLES);
    const bookingId = idParamSchema.parse((await params).id);
    const result = await adminCancelBookingWithRefund(bookingId);
    recordAuditLog(actor, request, "UPDATE", "booking", bookingId, { action: "admin_cancel_with_refund" });
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
