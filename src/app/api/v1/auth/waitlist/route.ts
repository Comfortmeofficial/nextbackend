import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { authErrorResponse } from "@/modules/auth/errors";
import { joinWaitlist, listWaitlist, type WaitlistInput } from "@/modules/auth/service";
import { listQuerySchema } from "@/lib/common-validation";

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

// GET /api/v1/auth/waitlist?skip=0&limit=50 — admin-only listing of everyone
// who has joined via the landing page's waitlist form.
export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth(request, OPS_ROLES);
    const { skip, limit } = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const items = await listWaitlist(skip, limit);
    return NextResponse.json(items);
  } catch (error) {
    return handleRouteError(error);
  }
}
