import { ApiError } from "@/lib/http-errors";
import { ensureCardsSchema, getCardsPool } from "./db";
import type { CardDto, CardRow } from "./types";
import type { CardCreateInput } from "./validation";

function toDto(row: CardRow): CardDto {
  return {
    id: row.id,
    user_id: row.user_id,
    card_holder_name: row.card_holder_name,
    last_four: row.last_four,
    card_type: row.card_type,
    expiry_month: row.expiry_month,
    expiry_year: row.expiry_year,
    bank_name: row.bank_name,
    paystack_auth_code: row.paystack_auth_code,
    is_default: row.is_default,
    created_at: row.created_at.toISOString(),
  };
}

async function findActiveById(id: number): Promise<CardRow | null> {
  const pool = getCardsPool();
  const { rows } = await pool.query<CardRow>(
    `SELECT * FROM cards WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

async function listActiveByUser(userId: number): Promise<CardRow[]> {
  const pool = getCardsPool();
  const { rows } = await pool.query<CardRow>(
    `SELECT * FROM cards WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY is_default DESC, created_at DESC`,
    [userId],
  );
  return rows;
}

export async function addCard(input: CardCreateInput): Promise<CardDto> {
  await ensureCardsSchema();
  const existing = await listActiveByUser(input.user_id);
  const isFirstCard = existing.length === 0;

  const pool = getCardsPool();
  const { rows } = await pool.query<CardRow>(
    `INSERT INTO cards (
       user_id, card_holder_name, last_four, card_type,
       expiry_month, expiry_year, bank_name, paystack_auth_code, is_default
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.user_id,
      input.card_holder_name,
      input.last_four,
      input.card_type,
      input.expiry_month,
      input.expiry_year,
      input.bank_name ?? null,
      input.paystack_auth_code ?? null,
      isFirstCard,
    ],
  );
  return toDto(rows[0]);
}

export async function listCards(userId: number): Promise<CardDto[]> {
  await ensureCardsSchema();
  const rows = await listActiveByUser(userId);
  return rows.map(toDto);
}

export async function deleteCard(cardId: number, userId: number): Promise<void> {
  await ensureCardsSchema();
  const card = await findActiveById(cardId);
  if (!card) {
    throw new ApiError(404, "Card not found");
  }
  if (card.user_id !== userId) {
    throw new ApiError(403, "Forbidden");
  }
  const pool = getCardsPool();
  await pool.query(`UPDATE cards SET deleted_at = now() WHERE id = $1`, [cardId]);
}

export async function setDefaultCard(cardId: number, userId: number): Promise<CardDto> {
  await ensureCardsSchema();
  const card = await findActiveById(cardId);
  if (!card || card.user_id !== userId) {
    throw new ApiError(404, "Card not found");
  }

  const pool = getCardsPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE cards SET is_default = false, updated_at = now() WHERE user_id = $1`, [
      userId,
    ]);
    const { rows } = await client.query<CardRow>(
      `UPDATE cards SET is_default = true, updated_at = now() WHERE id = $1 RETURNING *`,
      [cardId],
    );
    await client.query("COMMIT");
    return toDto(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
