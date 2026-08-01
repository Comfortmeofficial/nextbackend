import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { getUserByEmail } from "@/modules/users/repository";

type Params = { params: Promise<{ email: string }> };

// GET /api/v1/users/by-email/{email}
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { email } = await params;
    const user = await getUserByEmail(decodeURIComponent(email));
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    return NextResponse.json(user);
  } catch (error) {
    return handleRouteError(error);
  }
}
