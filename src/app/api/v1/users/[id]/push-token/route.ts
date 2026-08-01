import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { updatePushToken } from "@/modules/users/repository";
import { idParamSchema, pushTokenSchema } from "@/modules/users/validation";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/v1/users/{user_id}/push-token
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const id = idParamSchema.parse((await params).id);
    const body = pushTokenSchema.parse(await request.json());
    const user = await updatePushToken(id, body.push_token);
    return NextResponse.json(user);
  } catch (error) {
    return handleRouteError(error);
  }
}
