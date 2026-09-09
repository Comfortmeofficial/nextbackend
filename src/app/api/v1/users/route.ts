import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { SUPPORT_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { createUser, listUsers } from "@/modules/users/repository";
import { listQuerySchema, userCreateSchema } from "@/modules/users/validation";

// POST /api/v1/users/ — not actually called by either frontend today;
// /auth/signup creates the users row in-process via createUser() directly,
// not through this HTTP route. Left ungated for now (creation-only, no
// foreign-id impersonation risk like the routes below) rather than guessing
// at auth for a route with no current caller to verify against.
export async function POST(request: NextRequest) {
  try {
    const body = userCreateSchema.parse(await request.json());
    const user = await createUser(body);
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

// GET /api/v1/users/?skip=0&limit=100 — full directory listing (name,
// email, phone for every user); admin-only.
export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth(request, SUPPORT_ROLES);
    const { skip, limit } = listQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const users = await listUsers(skip, limit);
    return NextResponse.json(users);
  } catch (error) {
    return handleRouteError(error);
  }
}
