import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { FULL_ACCESS, requireAdminAuth } from "@/modules/admin/guard";
import { buildMassEmailHtml } from "@/modules/notifications/massEmail";
import { massEmailInputSchema } from "@/modules/notifications/validation";
import { listMassEmailRecipients } from "@/modules/users/repository";

// POST /api/v1/admin/mass-email/preview — renders the exact HTML a real
// recipient would get (a sample first name stands in for theirs), without
// sending. What's previewed is what's sent: this calls the same
// buildMassEmailHtml the real send does. Also returns how many people
// would receive it, so an admin sees the audience size before deciding to
// actually broadcast.
export async function POST(request: NextRequest) {
  try {
    await requireAdminAuth(request, FULL_ACCESS);
    const { subject, body } = massEmailInputSchema.parse(await request.json());
    const html = buildMassEmailHtml("Blessing", subject, body);
    const recipients = await listMassEmailRecipients();
    return NextResponse.json({ html, recipient_count: recipients.length });
  } catch (error) {
    return handleRouteError(error);
  }
}
