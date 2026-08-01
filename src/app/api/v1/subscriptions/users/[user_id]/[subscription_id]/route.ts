import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { ensureSubscriptionsSchema, query } from "@/modules/subscriptions/db";

type Params = { params: Promise<{ user_id: string; subscription_id: string }> };

// DELETE /api/v1/subscriptions/users/{user_id}/{subscription_id}
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await ensureSubscriptionsSchema();
    const { user_id, subscription_id } = await params;
    const result = await query(
      "UPDATE user_subscriptions SET status='cancelled' WHERE id=$1 AND user_id=$2 RETURNING *",
      [subscription_id, user_id],
    );
    if (result.rows.length === 0) {
      throw new ApiError(404, "Subscription not found");
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    return handleRouteError(error);
  }
}
