import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { resetPassword } from "@/modules/drivers/auth-service";
import { idParamSchema } from "@/lib/common-validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/drivers/{driver_id}/reset-password
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const id = idParamSchema.parse((await params).id);
    const temporary_password = await resetPassword(id);
    return NextResponse.json({ temporary_password });
  } catch (error) {
    return handleRouteError(error);
  }
}
