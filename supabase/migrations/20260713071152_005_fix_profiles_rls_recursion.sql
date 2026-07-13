/*
# Fix: Infinite Recursion in profiles RLS Policies

## Problem
The policies on `profiles` (select_all_profiles_admin, update_all_profiles_admin, insert_profiles_admin)
reference `SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'` in their USING/WITH CHECK
clauses. When RLS evaluates these policies, it queries `profiles` again, which triggers the same policies,
causing infinite recursion: `42P17: infinite recursion detected in policy for relation "profiles"`.

The `branches` table has similar policies referencing `profiles` — same issue.

## Fix
Replace all inline `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')` checks
with the `is_admin()` SECURITY DEFINER function, which queries `profiles` with the definer's privileges
(POSTGRES/SUPERUSER), bypassing RLS entirely. This breaks the recursion.

## Changes
- profiles: drop and recreate select_all_profiles_admin, update_all_profiles_admin, insert_profiles_admin
  using `is_admin()` instead of inline subquery
- branches: drop and recreate insert_branches_admin, update_branches_admin, delete_branches_admin
  using `is_admin()` instead of inline subquery
*/

-- ============================================================
-- FIX: PROFILES POLICIES
-- ============================================================

-- select_all_profiles_admin: use is_admin() instead of inline subquery
DROP POLICY IF EXISTS "select_all_profiles_admin" ON profiles;
CREATE POLICY "select_all_profiles_admin" ON profiles FOR SELECT
  TO authenticated USING (is_admin());

-- update_all_profiles_admin: use is_admin()
DROP POLICY IF EXISTS "update_all_profiles_admin" ON profiles;
CREATE POLICY "update_all_profiles_admin" ON profiles FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- insert_profiles_admin: use is_admin()
DROP POLICY IF EXISTS "insert_profiles_admin" ON profiles;
CREATE POLICY "insert_profiles_admin" ON profiles FOR INSERT
  TO authenticated WITH CHECK (is_admin());

-- ============================================================
-- FIX: BRANCHES POLICIES
-- ============================================================

-- insert_branches_admin: use is_admin()
DROP POLICY IF EXISTS "insert_branches_admin" ON branches;
CREATE POLICY "insert_branches_admin" ON branches FOR INSERT
  TO authenticated WITH CHECK (is_admin());

-- update_branches_admin: use is_admin()
DROP POLICY IF EXISTS "update_branches_admin" ON branches;
CREATE POLICY "update_branches_admin" ON branches FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- delete_branches_admin: use is_admin()
DROP POLICY IF EXISTS "delete_branches_admin" ON branches;
CREATE POLICY "delete_branches_admin" ON branches FOR DELETE
  TO authenticated USING (is_admin());
