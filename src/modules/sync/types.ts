export type SyncStatus = "pending" | "synced" | "failed";

export interface SyncRecordRow {
  id: string; // BIGSERIAL — node-postgres returns int8 as a string
  reference: string;
  amount: string; // NUMERIC comes back as a string from node-postgres
  transaction_type: string;
  status: SyncStatus;
  synced_at: Date | null;
  error_message: string | null;
  created_at: Date;
}

// Matches the Rust `SyncRecord` struct's Serialize impl.
export interface SyncRecordDto {
  id: number;
  reference: string;
  amount: number;
  transaction_type: string;
  status: SyncStatus;
  synced_at: string | null;
  error_message: string | null;
  created_at: string;
}
