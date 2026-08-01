import bcrypt from "bcryptjs";
import { ApiError } from "@/lib/http-errors";
import { ensureWalletSchema, getWalletPool } from "./db";
import type {
  AnalyticsPoint,
  TransactionDto,
  TransactionRow,
  TransactionTypeApi,
  WalletDto,
  WalletRow,
} from "./types";
import type { DeductWalletInput, FundWalletInput } from "./validation";

function toWalletDto(row: WalletRow): WalletDto {
  return {
    id: row.id,
    user_id: row.user_id,
    balance: parseFloat(row.balance),
    has_pin: row.pin_hash !== null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function toTransactionDto(row: TransactionRow): TransactionDto {
  return {
    id: row.id,
    wallet_id: row.wallet_id,
    type: row.type.toLowerCase() as TransactionDto["type"],
    amount: parseFloat(row.amount),
    description: row.description,
    reference: row.reference,
    status: row.status.toLowerCase() as TransactionDto["status"],
    created_at: row.created_at.toISOString(),
  };
}

export async function getOrCreateWallet(userId: number): Promise<WalletRow> {
  await ensureWalletSchema();
  const pool = getWalletPool();
  const { rows } = await pool.query<WalletRow>(
    `SELECT * FROM wallets WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  if (rows[0]) {
    return rows[0];
  }
  const inserted = await pool.query<WalletRow>(
    `INSERT INTO wallets (user_id, balance) VALUES ($1, 0) RETURNING *`,
    [userId],
  );
  return inserted.rows[0];
}

async function getWalletByUser(userId: number): Promise<WalletRow | null> {
  await ensureWalletSchema();
  const pool = getWalletPool();
  const { rows } = await pool.query<WalletRow>(
    `SELECT * FROM wallets WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function getWallet(userId: number): Promise<WalletDto> {
  return toWalletDto(await getOrCreateWallet(userId));
}

// Unlike the source's application-level read-modify-write (SELECT, add in
// Python, then UPDATE with the literal new value — a real lost-update race
// under concurrent funds/deducts), this uses an atomic SQL increment. Same
// observable contract in every success/error case; just not racy for a
// wallet balance, which seemed worth doing without being asked specifically.
async function adjustBalance(walletId: number, delta: number): Promise<void> {
  const pool = getWalletPool();
  await pool.query(`UPDATE wallets SET balance = balance + $2, updated_at = now() WHERE id = $1`, [
    walletId,
    delta,
  ]);
}

async function insertTransaction(
  walletId: number,
  type: TransactionTypeApi,
  amount: number,
  description: string,
  reference: string | null,
): Promise<TransactionDto> {
  const pool = getWalletPool();
  const { rows } = await pool.query<TransactionRow>(
    `INSERT INTO transactions (wallet_id, type, amount, description, reference, status)
     VALUES ($1, $2, $3, $4, $5, 'SUCCESSFUL')
     RETURNING *`,
    [walletId, type.toUpperCase(), amount, description, reference],
  );
  return toTransactionDto(rows[0]);
}

export async function fundWallet(input: FundWalletInput): Promise<TransactionDto> {
  await ensureWalletSchema();
  if (input.amount <= 0) {
    throw new ApiError(400, "Amount must be positive");
  }
  const wallet = await getOrCreateWallet(input.user_id);
  await adjustBalance(wallet.id, input.amount);
  return insertTransaction(wallet.id, "deposit", input.amount, input.description, input.reference ?? null);
}

export async function deductWallet(input: DeductWalletInput): Promise<TransactionDto> {
  await ensureWalletSchema();
  if (input.amount <= 0) {
    throw new ApiError(400, "Amount must be positive");
  }
  const wallet = await getWalletByUser(input.user_id);
  if (!wallet) {
    throw new ApiError(404, "Wallet not found");
  }
  if (parseFloat(wallet.balance) < input.amount) {
    throw new ApiError(400, "Insufficient wallet balance");
  }
  await adjustBalance(wallet.id, -input.amount);
  return insertTransaction(wallet.id, input.type, input.amount, input.description, input.reference ?? null);
}

export async function getTransactions(
  userId: number,
  skip: number,
  limit: number,
): Promise<TransactionDto[]> {
  await ensureWalletSchema();
  const wallet = await getWalletByUser(userId);
  if (!wallet) {
    return [];
  }
  const pool = getWalletPool();
  const { rows } = await pool.query<TransactionRow>(
    `SELECT * FROM transactions WHERE wallet_id = $1 ORDER BY created_at DESC OFFSET $2 LIMIT $3`,
    [wallet.id, skip, limit],
  );
  return rows.map(toTransactionDto);
}

export async function getAllTransactions(skip: number, limit: number): Promise<TransactionDto[]> {
  await ensureWalletSchema();
  const pool = getWalletPool();
  const { rows } = await pool.query<TransactionRow>(
    `SELECT * FROM transactions ORDER BY created_at DESC OFFSET $1 LIMIT $2`,
    [skip, limit],
  );
  return rows.map(toTransactionDto);
}

function isFourDigitPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export async function setPin(userId: number, pin: string): Promise<void> {
  await ensureWalletSchema();
  if (!isFourDigitPin(pin)) {
    throw new ApiError(400, "PIN must be a 4-digit number");
  }
  const wallet = await getOrCreateWallet(userId);
  const pinHash = await bcrypt.hash(pin, 12);
  const pool = getWalletPool();
  await pool.query(`UPDATE wallets SET pin_hash = $2, updated_at = now() WHERE id = $1`, [
    wallet.id,
    pinHash,
  ]);
}

export async function verifyPin(userId: number, pin: string): Promise<boolean> {
  await ensureWalletSchema();
  const wallet = await getWalletByUser(userId);
  if (!wallet || !wallet.pin_hash) {
    throw new ApiError(400, "No PIN set for this wallet");
  }
  return bcrypt.compare(pin, wallet.pin_hash);
}

export async function changePin(userId: number, currentPin: string, newPin: string): Promise<void> {
  await ensureWalletSchema();
  const wallet = await getWalletByUser(userId);
  if (!wallet || !wallet.pin_hash) {
    throw new ApiError(400, "No PIN set for this wallet");
  }
  if (!(await bcrypt.compare(currentPin, wallet.pin_hash))) {
    throw new ApiError(400, "Current PIN is incorrect");
  }
  if (!isFourDigitPin(newPin)) {
    throw new ApiError(400, "New PIN must be a 4-digit number");
  }
  const pinHash = await bcrypt.hash(newPin, 12);
  const pool = getWalletPool();
  await pool.query(`UPDATE wallets SET pin_hash = $2, updated_at = now() WHERE id = $1`, [
    wallet.id,
    pinHash,
  ]);
}

export async function getAnalytics(range: string): Promise<AnalyticsPoint[]> {
  await ensureWalletSchema();
  const now = new Date();
  let since: Date;
  if (range === "today") {
    since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  } else if (range === "week") {
    since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === "year") {
    since = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  } else {
    since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  const pool = getWalletPool();
  const { rows } = await pool.query<{ day: string; revenue: string; transactions: string }>(
    `SELECT
       TO_CHAR(created_at::date, 'YYYY-MM-DD') AS day,
       SUM(amount) AS revenue,
       COUNT(id) AS transactions
     FROM transactions
     WHERE created_at >= $1
       AND status = 'SUCCESSFUL'
       AND type IN ('TRIP_FARE', 'DEPOSIT')
     GROUP BY created_at::date
     ORDER BY created_at::date`,
    [since],
  );

  return rows.map((r) => ({
    label: r.day,
    revenue: parseFloat(r.revenue) || 0,
    bookings: parseInt(r.transactions, 10) || 0,
  }));
}
