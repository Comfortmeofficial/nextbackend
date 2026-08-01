import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { ensureSubscriptionsSchema, query } from "@/modules/subscriptions/db";

type Params = { params: Promise<{ user_id: string }> };

// GET /api/v1/subscriptions/users/{user_id}
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await ensureSubscriptionsSchema();
    const { user_id } = await params;
    const result = await query(
      `SELECT us.*, sp.name as plan_name, sp.price, sp.duration_days
       FROM user_subscriptions us
       JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE us.user_id = $1
       ORDER BY us.created_at DESC`,
      [user_id],
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    return handleRouteError(error);
  }
}

// POST /api/v1/subscriptions/users/{user_id}
export async function POST(request: NextRequest, { params }: Params) {
  try {
    await ensureSubscriptionsSchema();
    const { user_id } = await params;
    const { plan_id } = await request.json();

    const planResult = await query(
      "SELECT * FROM subscription_plans WHERE id = $1 AND is_active = TRUE",
      [plan_id],
    );
    if (planResult.rows.length === 0) {
      throw new ApiError(404, "Plan not found");
    }
    const plan = planResult.rows[0];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + plan.duration_days);

    const result = await query(
      "INSERT INTO user_subscriptions (user_id, plan_id, expires_at) VALUES ($1, $2, $3) RETURNING *",
      [user_id, plan_id, expiresAt],
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
