import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { markRead } from "@/modules/notifications/repository";
import { idParamSchema } from "@/modules/notifications/validation";

type Params = { params: Promise<{ id: string }> };

// PUT /api/v1/notifications/{notification_id}/read — always 200, whether or
// not a matching row (or a database at all) exists.
export async function PUT(_request: NextRequest, { params }: Params) {
  try {
    const notificationId = idParamSchema.parse((await params).id);
    await markRead(notificationId);
    return NextResponse.json({ message: "Marked as read" });
  } catch (error) {
    return handleRouteError(error);
  }
}
