import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { SUPPORT_ROLES } from "@/modules/admin/guard";
import { requireCustomerAuth, requireOwnerOrAdmin } from "@/modules/auth/guard";
import { revokeAllRefreshTokensForUser, syncEmailForUser } from "@/modules/auth/service";
import { deleteUser, getUser, updateUser } from "@/modules/users/repository";
import { idParamSchema, userUpdateSchema } from "@/modules/users/validation";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/users/{user_id} — an admin/support agent looking up any user,
// or a customer viewing their own profile.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const id = idParamSchema.parse((await params).id);
    requireOwnerOrAdmin(request, id, SUPPORT_ROLES, "Not your profile");
    const user = await getUser(id);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    return NextResponse.json(user);
  } catch (error) {
    return handleRouteError(error);
  }
}

// PUT /api/v1/users/{user_id} — also how the admin dashboard suspends a user
// (is_active: false), so a suspension must revoke sessions the same way
// deletion does, or a suspended user's existing refresh token would keep
// renewing their access indefinitely.
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const id = idParamSchema.parse((await params).id);
    requireOwnerOrAdmin(request, id, SUPPORT_ROLES, "Not your profile");
    const body = userUpdateSchema.parse(await request.json());
    // auth_users.email is the login identity — sync it first (and let it
    // reject a collision/missing-account outright) so users.email never
    // changes unless the login side actually accepted the new address too.
    if (body.email) {
      await syncEmailForUser(id, body.email);
    }
    const user = await updateUser(id, body);
    if (body.is_active === false) {
      await revokeAllRefreshTokensForUser(id);
    }
    return NextResponse.json(user);
  } catch (error) {
    return handleRouteError(error);
  }
}

// DELETE /api/v1/users/{user_id} — self-service account deletion only; no
// admin caller today (confirmed: admin_web_app never calls this).
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const id = idParamSchema.parse((await params).id);
    if (requireCustomerAuth(request) !== id) {
      throw new ApiError(403, "Not your account");
    }
    await deleteUser(id);
    await revokeAllRefreshTokensForUser(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
