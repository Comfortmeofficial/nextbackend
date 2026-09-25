import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_OR_MARSHAL_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { createTripIssue, listTripIssuesForRide } from "@/modules/booking/repository/issues";
import { getRideRow } from "@/modules/booking/repository/rides";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

const issueInputSchema = z.object({
  category: z.enum(["mechanical", "passenger", "safety", "other"]).default("other"),
  description: z.string().trim().min(1, "Describe the issue").max(2000),
});

async function requireAssignedMarshalOrOps(request: NextRequest, rideId: number) {
  const claims = await requireAdminAuth(request, OPS_OR_MARSHAL_ROLES);
  if (claims.role === "bus_marshal") {
    const ride = await getRideRow(rideId);
    if (!ride || ride.marshal_admin_id !== Number(claims.sub)) {
      throw new ApiError(403, "You are not assigned to this ride");
    }
  }
  return claims;
}

// GET /api/v1/rides/{id}/issues — issues reported on this ride, newest first.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    await requireAssignedMarshalOrOps(request, id);
    return NextResponse.json(await listTripIssuesForRide(id));
  } catch (error) {
    return handleRouteError(error);
  }
}

// POST /api/v1/rides/{id}/issues — the marshal conducting the ride (or ops)
// logs something ops should know about — mechanical trouble, a passenger
// incident, anything else — against that specific trip.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const claims = await requireAssignedMarshalOrOps(request, id);
    const body = issueInputSchema.parse(await request.json());

    const issue = await createTripIssue({
      ride_id: id,
      reported_by_admin_id: Number(claims.sub),
      category: body.category,
      description: body.description,
    });
    recordAuditLog(claims, request, "CREATE", "trip_issue", issue.id, body);
    return NextResponse.json(issue, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
