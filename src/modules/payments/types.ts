export interface InitializePaymentResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface VerifyPaymentResult {
  reference: string;
  amount: number;
  currency: string;
  status: string;
  paid_at: string | null;
  channel: string | null;
  customer_email: string | null;
  authorization_code: string | null;
  last_four: string | null;
  card_type: string | null;
  bank: string | null;
  exp_month: string | null;
  exp_year: string | null;
  metadata: Record<string, unknown> | null;
}
