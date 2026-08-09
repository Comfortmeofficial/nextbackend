import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { FULL_ACCESS, requireAdminAuth, requireRequestId, SUPER_ADMIN_ONLY } from "@/modules/admin/guard";
import { createAdmin, listAdmins } from "@/modules/admin/repository";
import { adminCreateSchema, listQuerySchema } from "@/modules/admin/validation";

// POST /api/v1/admins/ — creating an admin account (including super_admin)
// is the highest-risk action in this API, so this requires an existing
// super_admin's token. Previously had no auth check at all.
export async function POST(request: NextRequest) {
  const headerError = requireRequestId(request);
  if (headerError) return headerError;
  try {
    requireAdminAuth(request, SUPER_ADMIN_ONLY);
    const body = adminCreateSchema.parse(await request.json());
    const admin = await createAdmin(body);
    return NextResponse.json(admin, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

// GET /api/v1/admins/?skip=0&limit=100
export async function GET(request: NextRequest) {
  const headerError = requireRequestId(request);
  if (headerError) return headerError;
  try {
    requireAdminAuth(request, FULL_ACCESS);
    const { skip, limit } = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const admins = await listAdmins(skip, limit);
    return NextResponse.json(admins);
  } catch (error) {
    return handleRouteError(error);
  }
}
