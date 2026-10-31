import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError } from "@/lib/http-errors";
import { FINANCE_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { getActiveGateway, setActiveGateway } from "@/modules/payments/gateway";

const setGatewaySchema = z.object({
  active_gateway: z.enum(["paystack", "flutterwave"]),
});

// GET/PUT /api/v1/admin/payment-gateway — the single admin-controlled
// toggle deciding which gateway processes new card/bank-transfer payments
// platform-wide. Not customer-facing; same role bar as viewing the
// payments ledger.
export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth(request, FINANCE_ROLES);
    const active_gateway = await getActiveGateway();
    return NextResponse.json({ active_gateway });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await requireAdminAuth(request, FINANCE_ROLES);
    const { active_gateway } = setGatewaySchema.parse(await request.json());
    const result = await setActiveGateway(active_gateway, Number(admin.sub));
    return NextResponse.json({ active_gateway: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
