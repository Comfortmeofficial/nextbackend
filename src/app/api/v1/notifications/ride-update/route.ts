import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_OR_MARSHAL_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { sendRideUpdate } from "@/modules/notifications/service";
import { rideUpdateSchema } from "@/modules/notifications/validation";

// POST /api/v1/notifications/ride-update — also no email channel. The only
// caller is admin_web_app's NotificationsPage (confirmed no in-process
// caller exists), so this is safe to gate without breaking anything else.
export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminAuth(request, OPS_OR_MARSHAL_ROLES);
    const data = rideUpdateSchema.parse(await request.json());
    const result = await sendRideUpdate(data);
    recordAuditLog(actor, request, "UPDATE", "notification", data.ride_id, data);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
