import { SyncError } from "./errors";
import { ensureSyncSchema, getSyncPool } from "./db";
import type { SyncRecordDto, SyncRecordRow } from "./types";

function toDto(row: SyncRecordRow): SyncRecordDto {
  return {
    id: Number(row.id),
    reference: row.reference,
    amount: parseFloat(row.amount),
    transaction_type: row.transaction_type,
    status: row.status,
    synced_at: row.synced_at ? row.synced_at.toISOString() : null,
    error_message: row.error_message,
    created_at: row.created_at.toISOString(),
  };
}

export async function createSyncRecord(input: {
  reference: string;
  amount: number;
  transactionType: string;
}): Promise<SyncRecordDto> {
  await ensureSyncSchema();
  const pool = getSyncPool();
  try {
    const { rows } = await pool.query<SyncRecordRow>(
      `INSERT INTO sync_records (reference, amount, transaction_type) VALUES ($1, $2, $3) RETURNING *`,
      [input.reference, input.amount, input.transactionType],
    );
    return toDto(rows[0]);
  } catch {
    // Mirrors the source: ANY insert error (unique-violation or otherwise)
    // maps to 409.
    throw new SyncError(409);
  }
}

export async function listPending(): Promise<SyncRecordDto[]> {
  await ensureSyncSchema();
  const pool = getSyncPool();
  try {
    const { rows } = await pool.query<SyncRecordRow>(
      `SELECT * FROM sync_records WHERE status = 'pending' ORDER BY created_at`,
    );
    return rows.map(toDto);
  } catch {
    // Mirrors the source: any query failure here silently returns an empty
    // list with a 200, not an error response.
    return [];
  }
}

export async function markSynced(id: number): Promise<SyncRecordDto> {
  await ensureSyncSchema();
  const pool = getSyncPool();
  let rows;
  try {
    ({ rows } = await pool.query<SyncRecordRow>(
      `UPDATE sync_records SET status = 'synced', synced_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    ));
  } catch {
    throw new SyncError(500);
  }
  if (!rows[0]) {
    throw new SyncError(404);
  }
  return toDto(rows[0]);
}

export async function markFailed(id: number, errorMessage: string): Promise<SyncRecordDto> {
  await ensureSyncSchema();
  const pool = getSyncPool();
  let rows;
  try {
    ({ rows } = await pool.query<SyncRecordRow>(
      `UPDATE sync_records SET status = 'failed', error_message = $2 WHERE id = $1 RETURNING *`,
      [id, errorMessage],
    ));
  } catch {
    throw new SyncError(500);
  }
  if (!rows[0]) {
    throw new SyncError(404);
  }
  return toDto(rows[0]);
}
