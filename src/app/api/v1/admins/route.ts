import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { requireRequestId } from "@/modules/admin/guard";
import { createAdmin, listAdmins } from "@/modules/admin/repository";
import { adminCreateSchema, listQuerySchema } from "@/modules/admin/validation";

// POST /api/v1/admins/ — no auth check at all, matching the source exactly
// (a deliberately preserved gap, not an oversight in the port).
export async function POST(request: NextRequest) {
  const headerError = requireRequestId(request);
  if (headerError) return headerError;
  try {
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
    const { skip, limit } = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const admins = await listAdmins(skip, limit);
    return NextResponse.json(admins);
  } catch (error) {
    return handleRouteError(error);
  }
}
