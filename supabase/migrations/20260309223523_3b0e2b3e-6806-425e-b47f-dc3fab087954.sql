
-- Add 'unit_admin' to app_role enum for unit-level admin access
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'unit_admin';
