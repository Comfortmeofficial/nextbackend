import { after } from "next/server";
import type { NextRequest } from "next/server";
import { ensureAdminSchema, getAdminPool } from "./db";

export interface AuditActor {
  sub: string;
  email: string;
}

export interface AuditLogDto {
  id: string;
  actor_id: string;
  actor_email: string;
  action: string;
  resource: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

interface AuditLogRow {
  id: number;
  actor_id: string;
  actor_email: string;
  action: string;
  resource: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: Date;
}

function toDto(row: AuditLogRow): AuditLogDto {
  return {
    id: String(row.id),
    actor_id: row.actor_id,
    actor_email: row.actor_email,
    action: row.action,
    resource: row.resource,
    resource_id: row.resource_id,
    details: row.details,
    ip_address: row.ip_address,
    created_at: row.created_at.toISOString(),
  };
}

function getRequestIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}

// Best-effort, non-blocking — a logging failure must never fail the admin
// mutation it's describing. Runs via after() (same pattern as
// auth/service.ts's completeSignupVerification cross-module sync) so the
// write still completes once the response has gone out, rather than a bare
// unawaited promise a serverless runtime could freeze mid-flight. Callers
// pass the AdminTokenPayload they already got back from requireAdminAuth —
// no extra lookup needed.
export function recordAuditLog(
  actor: AuditActor,
  request: NextRequest,
  action: string,
  resource: string,
  resourceId?: string | number | null,
  details?: Record<string, unknown>,
): void {
  const ip = getRequestIp(request);
  after(() =>
    ensureAdminSchema()
      .then(() =>
        getAdminPool().query(
          `INSERT INTO audit_logs (actor_id, actor_email, action, resource, resource_id, details, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            actor.sub,
            actor.email,
            action,
            resource,
            resourceId != null ? String(resourceId) : null,
            details ? JSON.stringify(details) : null,
            ip,
          ],
        ),
      )
      .catch((err) => console.error("[audit] failed to record log:", err)),
  );
}

export async function listAuditLogs(
  skip: number,
  limit: number,
  startDate?: string,
  endDate?: string,
): Promise<AuditLogDto[]> {
  await ensureAdminSchema();
  const pool = getAdminPool();

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (startDate) {
    params.push(startDate);
    conditions.push(`created_at >= $${params.length}::date`);
  }
  if (endDate) {
    params.push(endDate);
    conditions.push(`created_at < $${params.length}::date + interval '1 day'`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(skip, limit);
  const { rows } = await pool.query<AuditLogRow>(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC OFFSET $${params.length - 1} LIMIT $${params.length}`,
    params,
  );
  return rows.map(toDto);
}
