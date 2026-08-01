import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/modules/auth/errors";
import { login } from "@/modules/auth/service";

// POST /api/v1/auth/login
export async function POST(request: NextRequest) {
  const { email, password } = await request.json();
  if (!email || !password) {
    return NextResponse.json({ detail: "email and password are required" }, { status: 400 });
  }
  try {
    const tokens = await login(email, password);
    return NextResponse.json({ message: "Login successful", data: tokens });
  } catch (error) {
    return authErrorResponse(error);
  }
}
