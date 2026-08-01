import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/modules/auth/errors";
import { signup, type SignupInput } from "@/modules/auth/service";

// POST /api/v1/auth/signup
//
// The legacy route has no explicit required-field check (unlike every
// sibling route in this file) — a missing field crashes inside the service
// function and leaks a raw TypeError message via the generic 500 handler.
// Every other route in the original file *does* guard required fields with
// a clean 400, so this fills in what looks like an omission rather than a
// deliberate contract, without changing behavior for any well-formed
// request (which is all real traffic).
export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<SignupInput>;
  const { first_name, last_name, email, phone, password } = body;
  if (!first_name || !last_name || !email || !phone || !password) {
    return NextResponse.json(
      { detail: "first_name, last_name, email, phone and password are required" },
      { status: 400 },
    );
  }
  try {
    const result = await signup(body as SignupInput);
    return NextResponse.json(
      { message: "Account created. Verify your phone number.", data: result },
      { status: 201 },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
