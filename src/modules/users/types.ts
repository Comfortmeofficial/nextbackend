export interface UserRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  password_hash: string;
  is_active: boolean;
  is_verified: boolean;
  city: string | null;
  state: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  referral_code: string | null;
  push_token: string | null;
  push_notifications_enabled: boolean;
  face_id_enabled: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

// Matches schemas.UserSchema (services/user_service/schemas/user.py) — note
// password_hash and deleted_at are never exposed.
export interface UserDto {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  referral_code: string | null;
  push_token: string | null;
  push_notifications_enabled: boolean;
  face_id_enabled: boolean;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}
