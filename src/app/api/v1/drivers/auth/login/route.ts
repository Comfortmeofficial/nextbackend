import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { login } from "@/modules/drivers/auth-service";
import { driverLoginSchema } from "@/modules/drivers/validation";

// POST /api/v1/drivers/auth/login
export async function POST(request: NextRequest) {
  try {
    const { email, password } = driverLoginSchema.parse(await request.json());
    const tokens = await login(email, password);
    return NextResponse.json(tokens);
  } catch (error) {
    return handleRouteError(error);
  }
}
