import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { setupSuperAdmin } from "@/modules/admin/auth-service";

// POST /api/v1/admin/auth/setup — one-time bootstrap endpoint, seeds the
// super admin from SUPER_ADMIN_* env vars. 409 if a super admin already
// exists.
export async function POST() {
  try {
    await setupSuperAdmin();
    return NextResponse.json({ message: "Super admin created successfully" }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
