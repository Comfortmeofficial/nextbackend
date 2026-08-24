import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { revokeAllRefreshTokensForUser } from "@/modules/auth/service";
import { deleteUser, getUser, updateUser } from "@/modules/users/repository";
import { idParamSchema, userUpdateSchema } from "@/modules/users/validation";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/users/{user_id}
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const id = idParamSchema.parse((await params).id);
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
    const body = userUpdateSchema.parse(await request.json());
    const user = await updateUser(id, body);
    if (body.is_active === false) {
      await revokeAllRefreshTokensForUser(id);
    }
    return NextResponse.json(user);
  } catch (error) {
    return handleRouteError(error);
  }
}

// DELETE /api/v1/users/{user_id}
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const id = idParamSchema.parse((await params).id);
    await deleteUser(id);
    await revokeAllRefreshTokensForUser(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
