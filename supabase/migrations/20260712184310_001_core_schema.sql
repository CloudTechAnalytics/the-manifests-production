/*
# Core Schema: Branches, Profiles, and Auth Helpers

## Overview
This migration establishes the foundational schema for the Freight Operations Management Platform.
It creates the branch system, user profiles (linked to Supabase Auth), and helper functions for
role-based access control and branch isolation.

## New Tables

### branches
- `id` (uuid, PK): Unique branch identifier
- `name` (text): Branch name (e.g., "Lagos", "Kano")
- `code` (text, unique): Short code for the branch (e.g., "LG")
- `address` (text): Physical address
- `phone` (text): Contact phone
- `email` (text): Contact email
- `is_active` (boolean): Soft-active flag
- `created_at` / `updated_at` / `deleted_at`: Audit fields

### profiles
- `id` (uuid, PK, FK -> auth.users): Links to Supabase Auth user
- `email` (text, unique): User email (mirrors auth.users)
- `full_name` (text): User's full name
- `role` (enum): admin | operations | sales | branch_manager
- `branch_id` (uuid, FK -> branches): Assigned branch
- `is_active` (boolean): Whether the user can log in
- `must_change_password` (boolean): Force password change on next login
- `created_by` / `updated_by` (uuid): Audit user references
- `created_at` / `updated_at` / `deleted_at`: Audit fields

## Helper Functions
- `get_current_profile()`: Returns the current user's profile row
- `is_admin()`: Returns true if current user is an admin
- `get_user_branch_id()`: Returns the current user's branch_id (null for admins)
- `can_access_branch(branch_uuid)`: Returns true if admin or user belongs to that branch

## Security
- RLS enabled on both tables
- Profiles: users can read their own profile; admins can read/update all profiles
- Branches: all authenticated users can read branches (needed for dropdowns); admins can manage
*/

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'operations', 'sales', 'branch_manager');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- BRANCHES TABLE (no FK references to profiles)
-- ============================================================

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  address text,
  phone text,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- PROFILES TABLE (FK to branches and auth.users)
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role user_role NOT NULL DEFAULT 'operations',
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ============================================================
-- RLS: BRANCHES
-- ============================================================

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_branches_authenticated" ON branches;
CREATE POLICY "select_branches_authenticated" ON branches FOR SELECT
  TO authenticated USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "insert_branches_admin" ON branches;
CREATE POLICY "insert_branches_admin" ON branches FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "update_branches_admin" ON branches;
CREATE POLICY "update_branches_admin" ON branches FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "delete_branches_admin" ON branches;
CREATE POLICY "delete_branches_admin" ON branches FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- RLS: PROFILES
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "select_all_profiles_admin" ON profiles;
CREATE POLICY "select_all_profiles_admin" ON profiles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "update_all_profiles_admin" ON profiles;
CREATE POLICY "update_all_profiles_admin" ON profiles FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "insert_profiles_admin" ON profiles;
CREATE POLICY "insert_profiles_admin" ON profiles FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION get_current_profile()
RETURNS profiles
LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT * FROM profiles WHERE id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND is_active = true);
$$;

CREATE OR REPLACE FUNCTION get_user_branch_id()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT branch_id FROM profiles WHERE id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION can_access_branch(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT is_admin() OR get_user_branch_id() = p_branch_id; $$;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profiles_branch_id ON profiles(branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(is_active) WHERE deleted_at IS NULL;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trigger_branches_updated_at
    BEFORE UPDATE ON branches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
