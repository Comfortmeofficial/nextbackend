import { ApiError } from "@/lib/http-errors";
import { ensureNotificationsSchema, getNotificationsPool } from "./db";
import type { BookingAlertEmailDto, BookingAlertEmailRow, NotificationDto, NotificationRow } from "./types";

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

// Scoped by owner (not just id) so marking someone else's notification read
// silently matches zero rows instead of requiring a separate ownership
// lookup — matches the route's existing "always 200" behavior either way.
export async function markRead(notificationId: number, userId: number): Promise<void> {
  const pool = getNotificationsPool();
  if (!pool) return;
  await ensureNotificationsSchema();
  await pool.query(`UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`, [
    notificationId,
    userId,
  ]);
}

function toAlertEmailDto(row: BookingAlertEmailRow): BookingAlertEmailDto {
  return { id: row.id, email: row.email, created_at: row.created_at.toISOString() };
}

export async function listBookingAlertEmails(): Promise<BookingAlertEmailDto[]> {
  const pool = getNotificationsPool();
  if (!pool) return [];
  await ensureNotificationsSchema();
  const { rows } = await pool.query<BookingAlertEmailRow>(
    `SELECT * FROM booking_alert_emails ORDER BY created_at DESC`,
  );
  return rows.map(toAlertEmailDto);
}

// Only used by the booking-creation fan-out — never route-facing, so no
// DTO shaping needed.
export async function listBookingAlertEmailAddresses(): Promise<string[]> {
  const pool = getNotificationsPool();
  if (!pool) return [];
  await ensureNotificationsSchema();
  const { rows } = await pool.query<{ email: string }>(`SELECT email FROM booking_alert_emails`);
  return rows.map((r) => r.email);
}

export async function addBookingAlertEmail(email: string, adminId: number): Promise<BookingAlertEmailDto> {
  const pool = getNotificationsPool();
  if (!pool) throw new ApiError(503, "Notifications database is not configured");
  await ensureNotificationsSchema();
  const { rows } = await pool.query<BookingAlertEmailRow>(
    `INSERT INTO booking_alert_emails (email, created_by_admin_id) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING *`,
    [email.trim().toLowerCase(), adminId],
  );
  return toAlertEmailDto(rows[0]);
}

export async function removeBookingAlertEmail(id: number): Promise<void> {
  const pool = getNotificationsPool();
  if (!pool) return;
  await ensureNotificationsSchema();
  await pool.query(`DELETE FROM booking_alert_emails WHERE id = $1`, [id]);
}
