import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { listQuerySchema } from "@/lib/common-validation";
import { listPayments } from "@/modules/payments/repository";

const filterQuerySchema = listQuerySchema.extend({
  status: z.enum(["pending", "successful", "failed"]).optional(),
  purpose: z.enum(["wallet_funding", "booking_payment", "package_payment", "rental_payment", "refund", "other"]).optional(),
  payment_method: z.enum(["debit_card", "bank_transfer", "wallet"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

// GET /api/v1/payments?skip=0&limit=50&status=&purpose=&payment_method=&from=&to=
// — the admin dashboard's Paystack/refund ledger.
export async function GET(request: NextRequest) {
  try {
    await requireAdminAuth(request, OPS_ROLES);
    const { skip, limit, status, purpose, payment_method, from, to } = filterQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const items = await listPayments(skip, limit, { status, purpose, payment_method, from, to });
    return NextResponse.json(items);
  } catch (error) {
    return handleRouteError(error);
  }
}
