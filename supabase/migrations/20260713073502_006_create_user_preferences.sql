/*
# Create user_preferences table

1. New Tables
- `user_preferences`
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK auth.users, unique, NOT NULL, DEFAULT auth.uid())
  - `theme` (text, 'light' | 'dark' | 'system', default 'system')
  - `notif_email_shipment_updates` (boolean, default true)
  - `notif_email_quotation_approvals` (boolean, default true)
  - `notif_email_system_alerts` (boolean, default true)
  - `notif_inapp_shipment_updates` (boolean, default true)
  - `notif_inapp_quotation_approvals` (boolean, default true)
  - `notif_inapp_system_alerts` (boolean, default true)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

2. Security
- RLS enabled.
- Owner-scoped CRUD: each authenticated user manages only their own preference row.
- Uses auth.uid() for ownership checks.
*/

CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  notif_email_shipment_updates boolean NOT NULL DEFAULT true,
  notif_email_quotation_approvals boolean NOT NULL DEFAULT true,
  notif_email_system_alerts boolean NOT NULL DEFAULT true,
  notif_inapp_shipment_updates boolean NOT NULL DEFAULT true,
  notif_inapp_quotation_approvals boolean NOT NULL DEFAULT true,
  notif_inapp_system_alerts boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_preferences" ON user_preferences;
CREATE POLICY "select_own_preferences" ON user_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_preferences" ON user_preferences;
CREATE POLICY "insert_own_preferences" ON user_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_preferences" ON user_preferences;
CREATE POLICY "update_own_preferences" ON user_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_preferences" ON user_preferences;
CREATE POLICY "delete_own_preferences" ON user_preferences FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
