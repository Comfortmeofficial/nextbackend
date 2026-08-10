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
