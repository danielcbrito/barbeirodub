
-- 1. Fix has_role: remove self-only restriction to make it a general-purpose role lookup.
-- user_roles is not user-writable, so cross-user reads are safe.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
  END
$function$;

-- 2. payment_events: restrict SELECT to payments owned by the caller (as client, barbeiro, or admin/ti).
DROP POLICY IF EXISTS "Payment events follow payment visibility" ON public.payment_events;
CREATE POLICY "Payment events follow payment visibility"
ON public.payment_events
FOR SELECT
TO authenticated
USING (
  payment_id IN (
    SELECT p.id FROM public.payments p
    WHERE p.user_id = auth.uid()
       OR p.barbeiro_id IN (SELECT b.id FROM public.barbeiros b WHERE b.user_id = auth.uid())
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'ti'::app_role)
);

-- 3. produtos: restrict public SELECT to active products and hide sensitive columns from anon.
DROP POLICY IF EXISTS produtos_select_public ON public.produtos;
CREATE POLICY produtos_select_public_active
ON public.produtos
FOR SELECT
TO anon, authenticated
USING (ativo = true AND COALESCE(status, 'ativo') <> 'inativo');

-- Column-level: anon can only see customer-facing fields (no cost/stock internals).
REVOKE SELECT ON public.produtos FROM anon;
GRANT SELECT (id, nome, descricao, preco, categoria_id, categoria, imagens, ativo, destaque, tenant_id, created_at, updated_at)
  ON public.produtos TO anon;
-- Authenticated keeps full SELECT (barbeiros/admins may need stock info via manage policy anyway).
GRANT SELECT ON public.produtos TO authenticated;
