
-- ============================================================
-- Migration: Add role_level to barbeiro_unidades
-- Corrected: user_roles has NO tenant_id column
-- Resolve tenant via barbeiros.tenant_id instead
-- ============================================================

-- 1. Add role_level column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'barbeiro_unidades'
      AND column_name = 'role_level'
  ) THEN
    ALTER TABLE public.barbeiro_unidades
      ADD COLUMN role_level TEXT DEFAULT 'barber';

    ALTER TABLE public.barbeiro_unidades
      ADD CONSTRAINT chk_barbeiro_unidades_role_level
        CHECK (role_level IN ('barber', 'unit_admin', 'full_control'));
  END IF;
END $$;

-- 2. Migrate existing data
UPDATE public.barbeiro_unidades
  SET role_level = 'barber'
  WHERE (role = 'barbeiro' OR role IS NULL)
    AND (role_level IS NULL OR role_level = 'barber');

UPDATE public.barbeiro_unidades
  SET role_level = 'unit_admin'
  WHERE role = 'admin'
    AND role_level != 'unit_admin';

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_barbeiro_unidades_role_level
  ON public.barbeiro_unidades(role_level);

CREATE INDEX IF NOT EXISTS idx_barbeiro_unidades_unidade_role
  ON public.barbeiro_unidades(unidade_id, role_level);

-- 4. Trigger: sync full_control ↔ user_roles.tenant_admin
-- user_roles schema: id, user_id, role (app_role enum), created_at
-- No tenant_id in user_roles — we just assign the role
CREATE OR REPLACE FUNCTION public.sync_full_control_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Resolve auth user_id from barbeiros
  SELECT b.user_id INTO v_user_id
    FROM public.barbeiros b
    WHERE b.id = NEW.barbeiro_id;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Promote to tenant_admin when role_level becomes full_control
  IF NEW.role_level = 'full_control' THEN
    INSERT INTO public.user_roles (user_id, role)
      VALUES (v_user_id, 'tenant_admin')
    ON CONFLICT (user_id, role) DO NOTHING;

  -- Demote: remove tenant_admin when leaving full_control
  ELSIF OLD IS NOT NULL
    AND OLD.role_level = 'full_control'
    AND NEW.role_level != 'full_control'
  THEN
    DELETE FROM public.user_roles
      WHERE user_id = v_user_id
        AND role = 'tenant_admin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_full_control ON public.barbeiro_unidades;

CREATE TRIGGER trg_sync_full_control
  AFTER UPDATE OF role_level ON public.barbeiro_unidades
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_full_control_role();

-- 5. Enable Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.barbeiro_unidades;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 6. RLS policies (tenant resolved via barbeiros.tenant_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'barbeiro_unidades'
      AND policyname = 'tenant_admin_update_role_level'
  ) THEN
    CREATE POLICY "tenant_admin_update_role_level"
      ON public.barbeiro_unidades
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role IN ('tenant_admin', 'admin')
        )
        AND EXISTS (
          SELECT 1 FROM public.tenant_unidades tu
          JOIN public.barbeiros b ON b.tenant_id = tu.tenant_id
          WHERE tu.id = barbeiro_unidades.unidade_id
            AND b.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'barbeiro_unidades'
      AND policyname = 'unit_admin_update_role_level'
  ) THEN
    CREATE POLICY "unit_admin_update_role_level"
      ON public.barbeiro_unidades
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.barbeiro_unidades me
          JOIN public.barbeiros b ON b.id = me.barbeiro_id
          WHERE b.user_id = auth.uid()
            AND me.unidade_id = barbeiro_unidades.unidade_id
            AND me.role_level = 'unit_admin'
        )
      );
  END IF;
END $$;
