import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { FULL_ACCESS, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { sendMassEmail } from "@/modules/notifications/massEmail";
import { massEmailInputSchema } from "@/modules/notifications/validation";
import { listMassEmailRecipients } from "@/modules/users/repository";

// POST /api/v1/admin/mass-email — broadcasts subject/body (wrapped in the
// standard branded template, personalized per recipient's first name) to
// every active user. Returns the recipient count right away; the actual
// sending runs in after() so the admin's request doesn't hang for however
// long however many hundred/thousand emails takes. super_admin/admin only
// — this reaches every user on the platform, a much bigger blast radius
// than the per-ride ride-update notification OPS_ROLES can already send.
export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminAuth(request, FULL_ACCESS);
    const { subject, body } = massEmailInputSchema.parse(await request.json());
    const recipients = await listMassEmailRecipients();

    after(() => sendMassEmail(subject, body).catch(() => {}));
    recordAuditLog(actor, request, "CREATE", "mass_email", null, {
      subject,
      recipient_count: recipients.length,
    });
    return NextResponse.json({ recipient_count: recipients.length });
  } catch (error) {
    return handleRouteError(error);
  }
}
