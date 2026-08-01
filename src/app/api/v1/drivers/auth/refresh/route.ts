import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { refresh } from "@/modules/drivers/auth-service";
import { refreshTokenSchema } from "@/modules/drivers/validation";

// POST /api/v1/drivers/auth/refresh
export async function POST(request: NextRequest) {
  try {
    const { refresh_token } = refreshTokenSchema.parse(await request.json());
    const tokens = await refresh(refresh_token);
    return NextResponse.json(tokens);
  } catch (error) {
    return handleRouteError(error);
  }
}
