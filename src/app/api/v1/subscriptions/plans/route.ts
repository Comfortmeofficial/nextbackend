import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { ensureSubscriptionsSchema, query } from "@/modules/subscriptions/db";

// GET /api/v1/subscriptions/plans
export async function GET() {
  try {
    await ensureSubscriptionsSchema();
    const result = await query("SELECT * FROM subscription_plans WHERE is_active = TRUE ORDER BY price");
    return NextResponse.json(result.rows);
  } catch (error) {
    return handleRouteError(error);
  }
}

// POST /api/v1/subscriptions/plans — no input validation in the source at
// all; a missing required field just fails the DB's NOT NULL constraint and
// falls through to a generic 500, which is replicated here rather than
// adding validation the original never had.
export async function POST(request: NextRequest) {
  try {
    await ensureSubscriptionsSchema();
    const { name, price, duration_days, description } = await request.json();
    const result = await query(
      "INSERT INTO subscription_plans (name, price, duration_days, description) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, price, duration_days, description],
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
