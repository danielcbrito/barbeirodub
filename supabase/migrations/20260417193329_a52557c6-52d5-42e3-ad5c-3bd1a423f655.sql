-- ============================================================
-- 1. TABELA: carteiras
-- ============================================================
CREATE TABLE public.carteiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id UUID NOT NULL UNIQUE REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  saldo_disponivel NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (saldo_disponivel >= 0),
  pix_automatico_ativo BOOLEAN NOT NULL DEFAULT false,
  chave_pix TEXT,
  tipo_chave_pix TEXT CHECK (tipo_chave_pix IN ('cpf','cnpj','email','telefone','aleatoria')),
  chave_pix_validada BOOLEAN NOT NULL DEFAULT false,
  chave_pix_titular TEXT,
  chave_pix_validada_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_carteiras_barbeiro ON public.carteiras(barbeiro_id);

ALTER TABLE public.carteiras ENABLE ROW LEVEL SECURITY;

-- RLS: barbeiro vê própria carteira
CREATE POLICY "Barbeiro vê própria carteira"
ON public.carteiras FOR SELECT
USING (
  barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid())
);

-- RLS: barbeiro pode atualizar SOMENTE pix_automatico_ativo / chave_pix (saldo nunca)
CREATE POLICY "Barbeiro atualiza própria config Pix"
ON public.carteiras FOR UPDATE
USING (
  barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid())
)
WITH CHECK (
  barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid())
);

-- RLS: tenant_admin vê carteiras dos próprios barbeiros
CREATE POLICY "Tenant admin vê carteiras dos seus barbeiros"
ON public.carteiras FOR SELECT
USING (
  barbeiro_id IN (
    SELECT b.id FROM public.barbeiros b
    JOIN public.tenants t ON t.id = b.tenant_id
    WHERE t.owner_user_id = auth.uid()
  )
);

-- RLS: admin/ti veem tudo
CREATE POLICY "Admin e TI veem todas carteiras"
ON public.carteiras FOR SELECT
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ti'));

-- Trigger updated_at
CREATE TRIGGER carteiras_set_updated_at
BEFORE UPDATE ON public.carteiras
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 2. TABELA: transacoes_financeiras
-- ============================================================
CREATE TYPE public.transacao_tipo AS ENUM (
  'entrada',
  'saque_manual',
  'saque_automatico',
  'estorno'
);

CREATE TYPE public.transacao_status AS ENUM (
  'pendente',
  'processando',
  'concluida',
  'falhou',
  'estornada'
);

CREATE TABLE public.transacoes_financeiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carteira_id UUID NOT NULL REFERENCES public.carteiras(id) ON DELETE CASCADE,
  barbeiro_id UUID NOT NULL REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  tipo public.transacao_tipo NOT NULL,
  valor NUMERIC(12, 2) NOT NULL CHECK (valor > 0),
  status public.transacao_status NOT NULL DEFAULT 'pendente',
  saldo_anterior NUMERIC(12, 2),
  saldo_posterior NUMERIC(12, 2),
  efi_e2e_id TEXT UNIQUE,
  efi_charge_id UUID REFERENCES public.efi_pix_charges(id) ON DELETE SET NULL,
  chave_pix_destino TEXT,
  descricao TEXT,
  erro_mensagem TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_transacoes_barbeiro_data ON public.transacoes_financeiras(barbeiro_id, created_at DESC);
CREATE INDEX idx_transacoes_status ON public.transacoes_financeiras(status) WHERE status IN ('pendente','processando');
CREATE INDEX idx_transacoes_tipo ON public.transacoes_financeiras(tipo);

ALTER TABLE public.transacoes_financeiras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Barbeiro vê próprias transações"
ON public.transacoes_financeiras FOR SELECT
USING (
  barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid())
);

CREATE POLICY "Tenant admin vê transações dos seus barbeiros"
ON public.transacoes_financeiras FOR SELECT
USING (
  barbeiro_id IN (
    SELECT b.id FROM public.barbeiros b
    JOIN public.tenants t ON t.id = b.tenant_id
    WHERE t.owner_user_id = auth.uid()
  )
);

CREATE POLICY "Admin e TI veem todas transações"
ON public.transacoes_financeiras FOR SELECT
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ti'));

CREATE TRIGGER transacoes_set_updated_at
BEFORE UPDATE ON public.transacoes_financeiras
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. TABELA: efi_saldo_alertas
-- ============================================================
CREATE TABLE public.efi_saldo_alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambiente TEXT NOT NULL CHECK (ambiente IN ('test','prod')),
  saldo_atual NUMERIC(12, 2) NOT NULL,
  limite_minimo NUMERIC(12, 2) NOT NULL DEFAULT 100.00,
  resolvido BOOLEAN NOT NULL DEFAULT false,
  resolvido_em TIMESTAMPTZ,
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_efi_alertas_ativos ON public.efi_saldo_alertas(created_at DESC) WHERE resolvido = false;

ALTER TABLE public.efi_saldo_alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Apenas admin e TI veem alertas Efí"
ON public.efi_saldo_alertas FOR SELECT
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ti'));

CREATE POLICY "Apenas admin e TI atualizam alertas Efí"
ON public.efi_saldo_alertas FOR UPDATE
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ti'));

-- ============================================================
-- 4. FUNÇÕES atômicas de saldo
-- ============================================================

-- Creditar (entrada via webhook Efí)
CREATE OR REPLACE FUNCTION public.creditar_carteira(
  p_barbeiro_id UUID,
  p_valor NUMERIC,
  p_charge_id UUID DEFAULT NULL,
  p_descricao TEXT DEFAULT 'Recebimento Pix'
)
RETURNS TABLE(
  carteira_id UUID,
  transacao_id UUID,
  saldo_anterior NUMERIC,
  saldo_novo NUMERIC,
  pix_automatico_ativo BOOLEAN,
  chave_pix TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carteira RECORD;
  v_transacao_id UUID;
  v_saldo_anterior NUMERIC;
  v_saldo_novo NUMERIC;
BEGIN
  IF p_valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser positivo';
  END IF;

  -- Garante carteira (lazy creation)
  INSERT INTO public.carteiras (barbeiro_id)
  VALUES (p_barbeiro_id)
  ON CONFLICT (barbeiro_id) DO NOTHING;

  -- Lock + atualiza
  SELECT * INTO v_carteira FROM public.carteiras
  WHERE barbeiro_id = p_barbeiro_id FOR UPDATE;

  v_saldo_anterior := v_carteira.saldo_disponivel;
  v_saldo_novo := v_saldo_anterior + p_valor;

  UPDATE public.carteiras
  SET saldo_disponivel = v_saldo_novo, updated_at = now()
  WHERE id = v_carteira.id;

  INSERT INTO public.transacoes_financeiras (
    carteira_id, barbeiro_id, tipo, valor, status,
    saldo_anterior, saldo_posterior, efi_charge_id, descricao, completed_at
  ) VALUES (
    v_carteira.id, p_barbeiro_id, 'entrada', p_valor, 'concluida',
    v_saldo_anterior, v_saldo_novo, p_charge_id, p_descricao, now()
  )
  RETURNING id INTO v_transacao_id;

  RETURN QUERY SELECT
    v_carteira.id, v_transacao_id, v_saldo_anterior, v_saldo_novo,
    v_carteira.pix_automatico_ativo, v_carteira.chave_pix;
END;
$$;

-- Debitar (saque manual ou automático) — registra como 'processando'
CREATE OR REPLACE FUNCTION public.debitar_carteira(
  p_barbeiro_id UUID,
  p_valor NUMERIC,
  p_tipo public.transacao_tipo,
  p_chave_pix_destino TEXT,
  p_descricao TEXT DEFAULT NULL
)
RETURNS TABLE(
  transacao_id UUID,
  saldo_anterior NUMERIC,
  saldo_novo NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carteira RECORD;
  v_transacao_id UUID;
  v_saldo_anterior NUMERIC;
  v_saldo_novo NUMERIC;
BEGIN
  IF p_valor <= 0 THEN RAISE EXCEPTION 'Valor deve ser positivo'; END IF;
  IF p_tipo NOT IN ('saque_manual','saque_automatico') THEN
    RAISE EXCEPTION 'Tipo inválido para débito';
  END IF;

  SELECT * INTO v_carteira FROM public.carteiras
  WHERE barbeiro_id = p_barbeiro_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Carteira não encontrada'; END IF;
  IF v_carteira.saldo_disponivel < p_valor THEN
    RAISE EXCEPTION 'SALDO_INSUFICIENTE: disponível R$ %, solicitado R$ %',
      v_carteira.saldo_disponivel, p_valor;
  END IF;

  v_saldo_anterior := v_carteira.saldo_disponivel;
  v_saldo_novo := v_saldo_anterior - p_valor;

  UPDATE public.carteiras
  SET saldo_disponivel = v_saldo_novo, updated_at = now()
  WHERE id = v_carteira.id;

  INSERT INTO public.transacoes_financeiras (
    carteira_id, barbeiro_id, tipo, valor, status,
    saldo_anterior, saldo_posterior, chave_pix_destino, descricao
  ) VALUES (
    v_carteira.id, p_barbeiro_id, p_tipo, p_valor, 'processando',
    v_saldo_anterior, v_saldo_novo, p_chave_pix_destino, p_descricao
  )
  RETURNING id INTO v_transacao_id;

  RETURN QUERY SELECT v_transacao_id, v_saldo_anterior, v_saldo_novo;
END;
$$;

-- Reverter transação falha (devolve valor ao saldo)
CREATE OR REPLACE FUNCTION public.reverter_transacao_falha(
  p_transacao_id UUID,
  p_erro_mensagem TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx RECORD;
BEGIN
  SELECT * INTO v_tx FROM public.transacoes_financeiras
  WHERE id = p_transacao_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Transação não encontrada'; END IF;
  IF v_tx.status NOT IN ('pendente','processando') THEN
    RAISE EXCEPTION 'Transação não pode ser revertida (status %)', v_tx.status;
  END IF;

  -- Devolve saldo
  UPDATE public.carteiras
  SET saldo_disponivel = saldo_disponivel + v_tx.valor, updated_at = now()
  WHERE id = v_tx.carteira_id;

  -- Marca como falhou
  UPDATE public.transacoes_financeiras
  SET status = 'falhou',
      erro_mensagem = p_erro_mensagem,
      updated_at = now()
  WHERE id = p_transacao_id;
END;
$$;

-- Confirmar transação concluída (chamada após sucesso na Efí)
CREATE OR REPLACE FUNCTION public.confirmar_transacao(
  p_transacao_id UUID,
  p_efi_e2e_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.transacoes_financeiras
  SET status = 'concluida',
      efi_e2e_id = p_efi_e2e_id,
      completed_at = now(),
      updated_at = now()
  WHERE id = p_transacao_id
    AND status IN ('pendente','processando');
END;
$$;