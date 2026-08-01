import { ensureNotificationsSchema, getNotificationsPool } from "./db";
import type { NotificationDto, NotificationRow } from "./types";

function toDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    is_read: row.is_read,
    created_at: row.created_at.toISOString(),
  };
}

// Mirrors _store() — a no-op whenever there's no database or no user_id
// (only OTPNotificationSchema.user_id is optional; every send from
// auth_service's OTP flow omits it, so those never get an inbox row).
export async function storeNotification(
  userId: number | null | undefined,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  const pool = getNotificationsPool();
  if (!pool || userId == null) return;
  await ensureNotificationsSchema();
  await pool.query(
    `INSERT INTO notifications (user_id, type, title, body) VALUES ($1, $2, $3, $4)`,
    [userId, type, title, body],
  );
}

export async function listNotifications(
  userId: number,
  skip: number,
  limit: number,
): Promise<NotificationDto[]> {
  const pool = getNotificationsPool();
  if (!pool) return [];
  await ensureNotificationsSchema();
  const { rows } = await pool.query<NotificationRow>(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC OFFSET $2 LIMIT $3`,
    [userId, skip, limit],
  );
  return rows.map(toDto);
}

export async function markRead(notificationId: number): Promise<void> {
  const pool = getNotificationsPool();
  if (!pool) return;
  await ensureNotificationsSchema();
  await pool.query(`UPDATE notifications SET is_read = true WHERE id = $1`, [notificationId]);
}
