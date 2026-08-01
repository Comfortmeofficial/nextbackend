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
