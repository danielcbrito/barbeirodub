
-- 1) Campanhas configuráveis por barbearia
CREATE TABLE public.campanhas_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('convide_ganhe','cliente_do_mes')),
  ativo boolean NOT NULL DEFAULT false,
  indicacoes_necessarias integer NOT NULL DEFAULT 2 CHECK (indicacoes_necessarias BETWEEN 1 AND 50),
  premio_descricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tipo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanhas_config TO authenticated;
GRANT ALL ON public.campanhas_config TO service_role;

ALTER TABLE public.campanhas_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff da barbearia gerencia campanhas"
ON public.campanhas_config FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'ti'::app_role)
  OR tenant_id = public.get_user_tenant_id()
  OR tenant_id IN (SELECT b.tenant_id FROM public.barbeiros b WHERE b.user_id = auth.uid() AND b.deleted_at IS NULL)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'ti'::app_role)
  OR tenant_id = public.get_user_tenant_id()
  OR tenant_id IN (SELECT b.tenant_id FROM public.barbeiros b WHERE b.user_id = auth.uid() AND b.deleted_at IS NULL)
);

CREATE POLICY "Clientes veem campanhas ativas"
ON public.campanhas_config FOR SELECT TO authenticated
USING (ativo = true);

CREATE TRIGGER trg_campanhas_config_updated_at
BEFORE UPDATE ON public.campanhas_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Marca indicações já convertidas em crédito
ALTER TABLE public.indicacoes
  ADD COLUMN IF NOT EXISTS credito_gerado boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_indicacoes_indicador_credito
  ON public.indicacoes (indicador_id, status, credito_gerado);

-- 3) Concede corte grátis quando o cliente atinge N convites liberados
CREATE OR REPLACE FUNCTION public.award_referral_credit_on_liberado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_needed integer;
  v_ativo boolean;
  v_ids uuid[];
BEGIN
  IF NEW.status <> 'liberado' OR COALESCE(OLD.status,'') = 'liberado' THEN
    RETURN NEW;
  END IF;

  SELECT a.tenant_id INTO v_tenant
  FROM public.agendamentos a
  WHERE a.id = NEW.agendamento_qualificador_id;

  IF v_tenant IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.ativo, c.indicacoes_necessarias INTO v_ativo, v_needed
  FROM public.campanhas_config c
  WHERE c.tenant_id = v_tenant AND c.tipo = 'convide_ganhe';

  IF NOT COALESCE(v_ativo, false) THEN
    RETURN NEW;
  END IF;

  v_needed := COALESCE(v_needed, 2);

  LOOP
    SELECT array_agg(i.id) INTO v_ids
    FROM (
      SELECT id FROM public.indicacoes
      WHERE indicador_id = NEW.indicador_id
        AND status = 'liberado'
        AND credito_gerado = false
      ORDER BY liberado_em NULLS LAST, criado_em
      LIMIT v_needed
    ) i;

    IF v_ids IS NULL OR array_length(v_ids, 1) < v_needed THEN
      EXIT;
    END IF;

    UPDATE public.indicacoes SET credito_gerado = true WHERE id = ANY(v_ids);

    INSERT INTO public.creditos_indicacao (user_id, indicacao_id, status)
    VALUES (NEW.indicador_id, v_ids[array_length(v_ids,1)], 'disponivel');
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_referral_credit ON public.indicacoes;
CREATE TRIGGER trg_award_referral_credit
AFTER UPDATE OF status ON public.indicacoes
FOR EACH ROW EXECUTE FUNCTION public.award_referral_credit_on_liberado();
