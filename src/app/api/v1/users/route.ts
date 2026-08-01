import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { createUser, listUsers } from "@/modules/users/repository";
import { listQuerySchema, userCreateSchema } from "@/modules/users/validation";

// POST /api/v1/users/
export async function POST(request: NextRequest) {
  try {
    const body = userCreateSchema.parse(await request.json());
    const user = await createUser(body);
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

// GET /api/v1/users/?skip=0&limit=100
export async function GET(request: NextRequest) {
  try {
    const { skip, limit } = listQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const users = await listUsers(skip, limit);
    return NextResponse.json(users);
  } catch (error) {
    return handleRouteError(error);
  }
}
