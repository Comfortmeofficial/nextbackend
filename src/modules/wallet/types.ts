export type TransactionTypeDb = "DEPOSIT" | "WITHDRAWAL" | "TRIP_FARE" | "REFUND";
export type TransactionTypeApi = "deposit" | "withdrawal" | "trip_fare" | "refund";
export type TransactionStatusDb = "PENDING" | "SUCCESSFUL" | "FAILED";
export type TransactionStatusApi = "pending" | "successful" | "failed";

export interface WalletRow {
  id: number;
  user_id: number;
  balance: string; // NUMERIC comes back as a string from node-postgres
  pin_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

// Matches schemas.WalletSchema — pin_hash is never exposed, only whether one exists.
export interface WalletDto {
  id: number;
  user_id: number;
  balance: number;
  has_pin: boolean;
  created_at: string;
  updated_at: string;
}

export interface TransactionRow {
  id: number;
  wallet_id: number;
  type: TransactionTypeDb;
  amount: string;
  description: string;
  reference: string | null;
  status: TransactionStatusDb;
  created_at: Date;
}

// Matches schemas.TransactionSchema
export interface TransactionDto {
  id: number;
  wallet_id: number;
  type: TransactionTypeApi;
  amount: number;
  description: string;
  reference: string | null;
  status: TransactionStatusApi;
  created_at: string;
}

export interface AnalyticsPoint {
  label: string;
  revenue: number;
  bookings: number;
}
