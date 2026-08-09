export type TermsStatusDb = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type TermsStatusApi = "draft" | "published" | "archived";
export type TermsDocType = "terms" | "privacy";

export interface TermsRow {
  id: number;
  version: string;
  title: string;
  content: string;
  status: TermsStatusDb;
  doc_type: TermsDocType;
  created_by_admin_id: number | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Matches schemas.TermsSchema (services/terms_and_conditions_service/schemas/terms.py)
export interface TermsDto {
  id: number;
  version: string;
  title: string;
  content: string;
  status: TermsStatusApi;
  doc_type: TermsDocType;
  created_by_admin_id: number | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
