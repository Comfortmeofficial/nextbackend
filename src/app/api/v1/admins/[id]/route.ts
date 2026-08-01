import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { requireRequestId } from "@/modules/admin/guard";
import { deleteAdmin, getAdmin, updateAdmin } from "@/modules/admin/repository";
import { adminUpdateSchema, idParamSchema } from "@/modules/admin/validation";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const headerError = requireRequestId(request);
  if (headerError) return headerError;
  try {
    const id = idParamSchema.parse((await params).id);
    const admin = await getAdmin(id);
    if (!admin) {
      throw new ApiError(404, "Admin not found");
    }
    return NextResponse.json(admin);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  const headerError = requireRequestId(request);
  if (headerError) return headerError;
  try {
    const id = idParamSchema.parse((await params).id);
    const body = adminUpdateSchema.parse(await request.json());
    const admin = await updateAdmin(id, body);
    return NextResponse.json(admin);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const headerError = requireRequestId(request);
  if (headerError) return headerError;
  try {
    const id = idParamSchema.parse((await params).id);
    await deleteAdmin(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
