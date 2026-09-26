
-- ═══════════════════════════════════════════════════════════
-- Contas Financeiras — onboarding manual assistido
-- ═══════════════════════════════════════════════════════════

-- 1. Tabela de contas financeiras (individual ou compartilhada)
CREATE TABLE IF NOT EXISTS public.contas_financeiras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  responsavel_nome TEXT NOT NULL,
  responsavel_barbeiro_id UUID REFERENCES public.barbeiros(id) ON DELETE SET NULL,
  tipo_conta TEXT NOT NULL DEFAULT 'individual' CHECK (tipo_conta IN ('individual', 'compartilhada')),
  asaas_account_id TEXT,
  asaas_wallet_id TEXT,
  efi_account_id TEXT,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_contas_financeiras_responsavel
  ON public.contas_financeiras(responsavel_barbeiro_id);

-- 2. Coluna de vínculo em barbeiros
ALTER TABLE public.barbeiros
  ADD COLUMN IF NOT EXISTS conta_financeira_id UUID REFERENCES public.contas_financeiras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conta_configurada BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_barbeiros_conta_financeira
  ON public.barbeiros(conta_financeira_id);

-- 3. Trigger updated_at
DROP TRIGGER IF EXISTS trg_contas_financeiras_updated_at ON public.contas_financeiras;
CREATE TRIGGER trg_contas_financeiras_updated_at
  BEFORE UPDATE ON public.contas_financeiras
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. RLS
ALTER TABLE public.contas_financeiras ENABLE ROW LEVEL SECURITY;

-- Admin/TI veem e gerenciam tudo
CREATE POLICY "Admin and TI can manage all financial accounts"
  ON public.contas_financeiras
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ti'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ti'));

-- Tenant admin gerencia contas dos seus barbeiros
CREATE POLICY "Tenant admin can manage own tenant accounts"
  ON public.contas_financeiras
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'tenant_admin') AND
    EXISTS (
      SELECT 1 FROM public.barbeiros b
      JOIN public.tenants t ON t.id = b.tenant_id
      WHERE b.conta_financeira_id = contas_financeiras.id
        AND t.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (public.has_role(auth.uid(), 'tenant_admin'));

-- Barbeiros leem apenas sua própria conta
CREATE POLICY "Barbers can read own financial account"
  ON public.contas_financeiras
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.barbeiros b
      WHERE b.conta_financeira_id = contas_financeiras.id
        AND b.user_id = auth.uid()
    )
  );

-- 5. Seed: criar conta do Túlio e vincular Pedro nela
DO $$
DECLARE
  v_tulio_id UUID;
  v_pedro_id UUID;
  v_conta_id UUID;
  v_tulio_asaas TEXT;
  v_tulio_wallet TEXT;
BEGIN
  -- Buscar Túlio (tem que ter asaas_account_id já configurado)
  SELECT id, asaas_account_id, asaas_wallet_id
  INTO v_tulio_id, v_tulio_asaas, v_tulio_wallet
  FROM public.barbeiros
  WHERE (apelido ILIKE 'túlio' OR apelido ILIKE 'tulio')
    AND deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_tulio_id IS NOT NULL THEN
    -- Cria conta compartilhada do Túlio
    INSERT INTO public.contas_financeiras (
      responsavel_nome, responsavel_barbeiro_id, tipo_conta,
      asaas_account_id, asaas_wallet_id, ativo, observacoes
    ) VALUES (
      'Túlio', v_tulio_id, 'compartilhada',
      v_tulio_asaas, v_tulio_wallet, true,
      'Conta principal — recebe pagamentos do Túlio e do Pedro Santos'
    )
    RETURNING id INTO v_conta_id;

    -- Vincula Túlio à própria conta
    UPDATE public.barbeiros
    SET conta_financeira_id = v_conta_id,
        conta_configurada = true
    WHERE id = v_tulio_id;

    -- Vincula Pedro Santos à conta do Túlio
    UPDATE public.barbeiros
    SET conta_financeira_id = v_conta_id,
        conta_configurada = true
    WHERE (apelido ILIKE 'pedro%santos' OR apelido ILIKE 'pedro santos')
      AND deleted_at IS NULL;

    SELECT id INTO v_pedro_id
    FROM public.barbeiros
    WHERE (apelido ILIKE 'pedro%santos' OR apelido ILIKE 'pedro santos')
      AND deleted_at IS NULL
    LIMIT 1;

    RAISE NOTICE 'Conta financeira criada: % | Túlio: % | Pedro: %', v_conta_id, v_tulio_id, v_pedro_id;
  ELSE
    RAISE NOTICE 'Túlio não encontrado — seed ignorado';
  END IF;
END $$;
