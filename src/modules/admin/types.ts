export type AdminRoleDb =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "OPERATIONS_MANAGER"
  | "CUSTOMER_SUPPORT"
  | "FINANCE_OFFICER"
  | "BUS_MARSHAL";
export type AdminRoleApi =
  | "super_admin"
  | "admin"
  | "operations_manager"
  | "customer_support"
  | "finance_officer"
  | "bus_marshal";

export interface AdminRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
  role: AdminRoleDb;
  is_active: boolean;
  phone: string | null;
  address: string | null;
  next_of_kin: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  created_at: Date;
  updated_at: Date;
}

// Matches schemas.AdminSchema, plus the contact/next-of-kin fields added for
// the Bus Marshals page.
export interface AdminDto {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: AdminRoleApi;
  is_active: boolean;
  phone: string | null;
  address: string | null;
  next_of_kin: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  created_at: string;
  updated_at: string;
}
