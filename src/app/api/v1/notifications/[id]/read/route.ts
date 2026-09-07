import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { markRead } from "@/modules/notifications/repository";
import { idParamSchema } from "@/modules/notifications/validation";

type Params = { params: Promise<{ id: string }> };

// PUT /api/v1/notifications/{notification_id}/read — always 200, whether or
// not a matching row (or a database at all) exists. markRead is scoped by
// the caller's own userId, so marking someone else's notification read
// silently no-ops instead of needing a separate ownership lookup.
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const notificationId = idParamSchema.parse((await params).id);
    const userId = requireCustomerAuth(request);
    await markRead(notificationId, userId);
    return NextResponse.json({ message: "Marked as read" });
  } catch (error) {
    return handleRouteError(error);
  }
}
