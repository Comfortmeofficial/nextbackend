export type AdminRoleDb =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "OPERATIONS_MANAGER"
  | "CUSTOMER_SUPPORT"
  | "FINANCE_OFFICER";
export type AdminRoleApi =
  | "super_admin"
  | "admin"
  | "operations_manager"
  | "customer_support"
  | "finance_officer";

export interface AdminRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
  role: AdminRoleDb;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Matches schemas.AdminSchema
export interface AdminDto {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: AdminRoleApi;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
