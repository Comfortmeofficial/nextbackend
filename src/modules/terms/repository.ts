import { ApiError } from "@/lib/http-errors";
import { ensureTermsSchema, getTermsPool } from "./db";
import type { TermsDto, TermsRow, TermsStatusApi } from "./types";
import type { TermsCreateInput, TermsUpdateInput } from "./validation";

function toApiStatus(status: TermsRow["status"]): TermsStatusApi {
  return status.toLowerCase() as TermsStatusApi;
}

function toDto(row: TermsRow): TermsDto {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    content: row.content,
    status: toApiStatus(row.status),
    created_by_admin_id: row.created_by_admin_id,
    published_at: row.published_at ? row.published_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

async function findById(id: number): Promise<TermsRow | null> {
  const pool = getTermsPool();
  const { rows } = await pool.query<TermsRow>(
    `SELECT * FROM terms_and_conditions WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createTerms(input: TermsCreateInput): Promise<TermsDto> {
  await ensureTermsSchema();
  const pool = getTermsPool();
  const { rows } = await pool.query<TermsRow>(
    `INSERT INTO terms_and_conditions (version, title, content, created_by_admin_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.version, input.title, input.content, input.created_by_admin_id ?? null],
  );
  return toDto(rows[0]);
}

export async function listTerms(skip: number, limit: number): Promise<TermsDto[]> {
  await ensureTermsSchema();
  const pool = getTermsPool();
  const { rows } = await pool.query<TermsRow>(
    `SELECT * FROM terms_and_conditions ORDER BY created_at DESC OFFSET $1 LIMIT $2`,
    [skip, limit],
  );
  return rows.map(toDto);
}

export async function getTerms(id: number): Promise<TermsDto> {
  await ensureTermsSchema();
  const row = await findById(id);
  if (!row) {
    throw new ApiError(404, "Terms not found");
  }
  return toDto(row);
}

export async function getCurrentTerms(): Promise<TermsDto> {
  await ensureTermsSchema();
  const pool = getTermsPool();
  const { rows } = await pool.query<TermsRow>(
    `SELECT * FROM terms_and_conditions WHERE status = 'PUBLISHED'
     ORDER BY published_at DESC LIMIT 1`,
  );
  if (!rows[0]) {
    throw new ApiError(404, "No published terms found");
  }
  return toDto(rows[0]);
}

export async function updateTerms(id: number, input: TermsUpdateInput): Promise<TermsDto> {
  await ensureTermsSchema();
  const row = await findById(id);
  if (!row) {
    throw new ApiError(404, "Terms not found");
  }
  if (row.status === "PUBLISHED") {
    throw new ApiError(400, "Cannot edit published terms. Create a new version.");
  }

  const candidates: Array<[string, string | null | undefined]> = [
    ["title", input.title],
    ["content", input.content],
    ["version", input.version],
  ];
  const fields = candidates.filter(
    (entry): entry is [string, string] => entry[1] != null,
  );

  if (fields.length === 0) {
    return toDto(row);
  }

  const setClauses = fields.map(([col], i) => `${col} = $${i + 2}`);
  setClauses.push(`updated_at = now()`);
  const pool = getTermsPool();
  const { rows } = await pool.query<TermsRow>(
    `UPDATE terms_and_conditions SET ${setClauses.join(", ")} WHERE id = $1 RETURNING *`,
    [id, ...fields.map(([, value]) => value)],
  );
  return toDto(rows[0]);
}

export async function publishTerms(id: number): Promise<TermsDto> {
  await ensureTermsSchema();
  const row = await findById(id);
  if (!row) {
    throw new ApiError(404, "Terms not found");
  }
  if (row.status === "PUBLISHED") {
    throw new ApiError(400, "Already published");
  }

  const pool = getTermsPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE terms_and_conditions SET status = 'ARCHIVED', updated_at = now() WHERE status = 'PUBLISHED'`,
    );
    const { rows } = await client.query<TermsRow>(
      `UPDATE terms_and_conditions
       SET status = 'PUBLISHED', published_at = now(), updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id],
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
