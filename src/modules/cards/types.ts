export interface CardRow {
  id: number;
  user_id: number;
  card_holder_name: string;
  last_four: string;
  card_type: string;
  expiry_month: string;
  expiry_year: string;
  bank_name: string | null;
  paystack_auth_code: string | null;
  gateway: string;
  flutterwave_token: string | null;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

// Matches schemas.CardSchema (services/card_service/schemas/card.py) — note
// there's no updated_at in the legacy response, only created_at. The raw
// provider token (paystack_auth_code / flutterwave_token) is deliberately
// NOT exposed here — charging a saved card now goes through `card_id`
// (service.ts resolves the token server-side), so the client never needs to
// see, store, or re-submit it.
export interface CardDto {
  id: number;
  user_id: number;
  card_holder_name: string;
  last_four: string;
  card_type: string;
  expiry_month: string;
  expiry_year: string;
  bank_name: string | null;
  gateway: string;
  is_default: boolean;
  created_at: string;
}
