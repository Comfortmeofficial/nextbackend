import { ensureBookingSchema, getBookingPool } from "../db";
import type { ChatMessageDto, ChatMessageRow, ChatSenderType } from "../types";

function toDto(row: ChatMessageRow): ChatMessageDto {
  return {
    id: row.id,
    ride_id: row.ride_id,
    user_id: row.user_id,
    sender_type: row.sender_type,
    message: row.message,
    created_at: row.created_at.toISOString(),
  };
}

export async function listChatMessages(rideId: number, userId: number): Promise<ChatMessageDto[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<ChatMessageRow>(
    `SELECT * FROM trip_chat_messages WHERE ride_id = $1 AND user_id = $2 ORDER BY created_at ASC`,
    [rideId, userId],
  );
  return rows.map(toDto);
}

export async function createChatMessage(
  rideId: number,
  userId: number,
  senderType: ChatSenderType,
  message: string,
): Promise<ChatMessageDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<ChatMessageRow>(
    `INSERT INTO trip_chat_messages (ride_id, user_id, sender_type, message)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [rideId, userId, senderType, message],
  );
  return toDto(rows[0]);
}

// A customer may only chat on a ride they actually have a live booking on
// — otherwise anyone with a ride id could open a thread with its marshal.
export async function customerHasBookingOnRide(rideId: number, userId: number): Promise<boolean> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query(
    `SELECT 1 FROM bookings WHERE ride_id = $1 AND user_id = $2 AND deleted_at IS NULL AND status != 'cancelled' LIMIT 1`,
    [rideId, userId],
  );
  return rows.length > 0;
}

export interface ChatThreadDto {
  user_id: number;
  last_message: string;
  last_sender_type: ChatSenderType;
  last_at: string;
  // Only messages the customer sent — the marshal's own replies never count
  // as "unread" for them, so the admin UI compares this against how many it
  // has already seen per thread.
  customer_message_count: number;
}

// One row per rider who has written on this ride, for the marshal's inbox:
// who has messaged, the latest line, and how many customer messages exist.
export async function listChatThreadsForRide(rideId: number): Promise<ChatThreadDto[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<{
    user_id: number;
    last_message: string;
    last_sender_type: ChatSenderType;
    last_at: Date;
    customer_message_count: string;
  }>(
    `SELECT user_id,
            (ARRAY_AGG(message ORDER BY created_at DESC, id DESC))[1] AS last_message,
            (ARRAY_AGG(sender_type ORDER BY created_at DESC, id DESC))[1] AS last_sender_type,
            MAX(created_at) AS last_at,
            COUNT(*) FILTER (WHERE sender_type = 'customer') AS customer_message_count
     FROM trip_chat_messages
     WHERE ride_id = $1
     GROUP BY user_id
     ORDER BY MAX(created_at) DESC`,
    [rideId],
  );
  return rows.map((r) => ({
    user_id: r.user_id,
    last_message: r.last_message,
    last_sender_type: r.last_sender_type,
    last_at: r.last_at.toISOString(),
    customer_message_count: parseInt(r.customer_message_count, 10),
  }));
}
