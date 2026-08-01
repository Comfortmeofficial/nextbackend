import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { updatePreferences } from "@/modules/users/repository";
import { idParamSchema, preferencesSchema } from "@/modules/users/validation";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/v1/users/{user_id}/preferences
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const id = idParamSchema.parse((await params).id);
    const body = preferencesSchema.parse(await request.json());
    const user = await updatePreferences(id, body);
    return NextResponse.json(user);
  } catch (error) {
    return handleRouteError(error);
  }
}
