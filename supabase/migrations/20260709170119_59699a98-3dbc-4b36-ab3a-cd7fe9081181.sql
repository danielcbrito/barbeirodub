
-- ═══ Programa de Indicação: acesso admin/tenant_admin/ti + função de invalidação ═══

-- 1) Ampliar leitura para tenant_admin e ti (mantém admin e barber existentes por compat)
DROP POLICY IF EXISTS "Admin ve todas indicacoes" ON public.indicacoes;
CREATE POLICY "Staff ve todas indicacoes"
  ON public.indicacoes FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'tenant_admin'::app_role)
    OR public.has_role(auth.uid(), 'ti'::app_role)
    OR public.has_role(auth.uid(), 'barber'::app_role)
  );

DROP POLICY IF EXISTS "Admin ve todos creditos" ON public.creditos_indicacao;
CREATE POLICY "Staff ve todos creditos"
  ON public.creditos_indicacao FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'tenant_admin'::app_role)
    OR public.has_role(auth.uid(), 'ti'::app_role)
    OR public.has_role(auth.uid(), 'barber'::app_role)
  );

-- 2) Função de invalidação manual
CREATE OR REPLACE FUNCTION public.admin_invalidar_indicacao(
  p_indicacao_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_indicacao record;
  v_credito record;
  v_credito_expirado boolean := false;
BEGIN
  -- Guard: apenas staff pode invalidar
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'tenant_admin'::app_role)
    OR public.has_role(auth.uid(), 'ti'::app_role)
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'Motivo é obrigatório (mínimo 3 caracteres)';
  END IF;

  SELECT * INTO v_indicacao FROM public.indicacoes WHERE id = p_indicacao_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Indicação não encontrada';
  END IF;

  IF v_indicacao.status = 'invalidado' THEN
    RAISE EXCEPTION 'Indicação já está invalidada';
  END IF;

  -- Verifica crédito associado
  SELECT * INTO v_credito
    FROM public.creditos_indicacao
   WHERE indicacao_id = p_indicacao_id
   ORDER BY criado_em DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND AND v_credito.status = 'usado' THEN
    RAISE EXCEPTION 'Não é possível invalidar: o crédito desta indicação já foi consumido';
  END IF;

  -- Invalida a indicação
  UPDATE public.indicacoes
     SET status = 'invalidado',
         motivo_invalidacao = p_motivo
   WHERE id = p_indicacao_id;

  -- Expira crédito disponível, se houver
  IF FOUND AND v_credito.status = 'disponivel' THEN
    UPDATE public.creditos_indicacao
       SET status = 'expirado'
     WHERE id = v_credito.id;
    v_credito_expirado := true;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'credito_expirado', v_credito_expirado,
    'indicacao_id', p_indicacao_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_invalidar_indicacao(uuid, text) TO authenticated;
