import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { login } from "@/modules/admin/auth-service";
import { adminLoginSchema } from "@/modules/admin/validation";

// POST /api/v1/admin/auth/login
export async function POST(request: NextRequest) {
  try {
    const { email, password } = adminLoginSchema.parse(await request.json());
    const result = await login(email, password);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
