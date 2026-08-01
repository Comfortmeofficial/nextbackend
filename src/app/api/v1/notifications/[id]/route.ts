import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { listNotifications } from "@/modules/notifications/repository";
import { idParamSchema, listQuerySchema } from "@/modules/notifications/validation";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/notifications/{user_id} — returns [] if storage isn't
// configured, same as the source's `if db is None: return []`.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = idParamSchema.parse((await params).id);
    const { skip, limit } = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const notifications = await listNotifications(userId, skip, limit);
    return NextResponse.json(notifications);
  } catch (error) {
    return handleRouteError(error);
  }
}
