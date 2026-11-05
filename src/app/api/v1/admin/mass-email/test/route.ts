import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { FULL_ACCESS, requireAdminAuth } from "@/modules/admin/guard";
import { getAdmin } from "@/modules/admin/repository";
import { buildMassEmailHtml } from "@/modules/notifications/massEmail";
import { sendEmail } from "@/modules/notifications/providers/resend";
import { massEmailInputSchema } from "@/modules/notifications/validation";

// POST /api/v1/admin/mass-email/test — sends the real, fully-rendered
// template to the requesting admin's own inbox only, so they can sanity
// check it before broadcasting to every user.
export async function POST(request: NextRequest) {
  try {
    const claims = await requireAdminAuth(request, FULL_ACCESS);
    const { subject, body } = massEmailInputSchema.parse(await request.json());
    const admin = await getAdmin(Number(claims.sub));
    if (!admin) throw new ApiError(404, "Admin not found");

    const html = buildMassEmailHtml(admin.first_name, subject, body);
    const sent = await sendEmail(admin.email, subject, html);
    if (!sent) throw new ApiError(502, "Email could not be sent — check the Resend configuration");

    return NextResponse.json({ sent_to: admin.email });
  } catch (error) {
    return handleRouteError(error);
  }
}
