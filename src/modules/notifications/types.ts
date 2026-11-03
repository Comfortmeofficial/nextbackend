export interface NotificationRow {
  id: number;
  user_id: number;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: Date;
}

// Matches schemas.NotificationSchema
export interface NotificationDto {
  id: number;
  user_id: number;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export interface BookingAlertEmailRow {
  id: number;
  email: string;
  created_by_admin_id: number | null;
  created_at: Date;
}

export interface BookingAlertEmailDto {
  id: number;
  email: string;
  created_at: string;
}
