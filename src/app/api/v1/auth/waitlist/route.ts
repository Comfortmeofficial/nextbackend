import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/modules/auth/errors";
import { joinWaitlist, type WaitlistInput } from "@/modules/auth/service";

// POST /api/v1/auth/waitlist
export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<WaitlistInput>;
  const { full_name, email } = body;
  if (!full_name || !email) {
    return NextResponse.json({ detail: "full_name and email are required" }, { status: 400 });
  }
  try {
    const result = await joinWaitlist(body as WaitlistInput);
    return NextResponse.json({ message: "You're on the waitlist!", data: result }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
