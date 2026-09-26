
-- ═══════════════════════════════════════════════
-- SISTEMA DE ASSINATURAS SaaS PARA TENANTS
-- ═══════════════════════════════════════════════

-- 1) Adicionar trial_ends_at na tabela tenants
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- 2) Enum para status da assinatura do tenant
DO $$ BEGIN
  CREATE TYPE public.tenant_subscription_status AS ENUM (
    'trialing',
    'active',
    'expired',
    'cancelled',
    'past_due'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) Tabela de planos SaaS disponíveis
CREATE TABLE IF NOT EXISTS public.tenant_planos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  preco_mensal NUMERIC(10,2) NOT NULL DEFAULT 49.90,
  preco_anual NUMERIC(10,2),
  destaque BOOLEAN DEFAULT false,
  funcionalidades JSONB DEFAULT '[]'::jsonb,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tenant_planos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Planos SaaS visíveis para autenticados"
ON public.tenant_planos FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admin gerencia planos SaaS"
ON public.tenant_planos FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 4) Tabela de assinaturas dos tenants
CREATE TABLE IF NOT EXISTS public.tenant_assinaturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plano_id UUID REFERENCES public.tenant_planos(id),
  status public.tenant_subscription_status NOT NULL DEFAULT 'trialing',
  trial_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  trial_end TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  subscription_start TIMESTAMPTZ,
  next_billing_date TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  payment_method TEXT,
  payment_reference TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id)
);

ALTER TABLE public.tenant_assinaturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant vê própria assinatura"
ON public.tenant_assinaturas FOR SELECT TO authenticated
USING (
  tenant_id IN (SELECT id FROM public.tenants WHERE owner_user_id = auth.uid())
);

CREATE POLICY "Tenant atualiza própria assinatura"
ON public.tenant_assinaturas FOR UPDATE TO authenticated
USING (
  tenant_id IN (SELECT id FROM public.tenants WHERE owner_user_id = auth.uid())
);

CREATE POLICY "Admin gerencia assinaturas tenants"
ON public.tenant_assinaturas FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 5) Trigger para criar assinatura trial automaticamente ao completar onboarding
CREATE OR REPLACE FUNCTION public.create_trial_on_onboarding_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.onboarding_completed = true AND (OLD.onboarding_completed IS NULL OR OLD.onboarding_completed = false) THEN
    INSERT INTO public.tenant_assinaturas (tenant_id, status, trial_start, trial_end)
    VALUES (NEW.id, 'trialing', now(), now() + interval '7 days')
    ON CONFLICT (tenant_id) DO NOTHING;
    
    NEW.trial_ends_at := now() + interval '7 days';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_trial_on_onboarding
BEFORE UPDATE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.create_trial_on_onboarding_complete();

-- 6) Função para verificar status da assinatura do tenant
CREATE OR REPLACE FUNCTION public.get_tenant_subscription_status(p_tenant_id UUID)
RETURNS TABLE(
  status TEXT,
  trial_end TIMESTAMPTZ,
  days_remaining INT,
  is_trial BOOLEAN,
  is_active BOOLEAN,
  is_expired BOOLEAN,
  plano_nome TEXT,
  preco_mensal NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sub RECORD;
BEGIN
  SELECT ta.*, tp.nome as p_nome, tp.preco_mensal as p_preco
  INTO v_sub
  FROM public.tenant_assinaturas ta
  LEFT JOIN public.tenant_planos tp ON tp.id = ta.plano_id
  WHERE ta.tenant_id = p_tenant_id;
  
  IF NOT FOUND THEN
    status := 'no_subscription';
    trial_end := NULL;
    days_remaining := 0;
    is_trial := false;
    is_active := false;
    is_expired := true;
    plano_nome := NULL;
    preco_mensal := NULL;
    RETURN NEXT;
    RETURN;
  END IF;
  
  IF v_sub.status = 'trialing' AND v_sub.trial_end < now() THEN
    UPDATE public.tenant_assinaturas SET status = 'expired', updated_at = now()
    WHERE id = v_sub.id;
    v_sub.status := 'expired';
  END IF;
  
  status := v_sub.status::text;
  trial_end := v_sub.trial_end;
  days_remaining := GREATEST(0, EXTRACT(DAY FROM (v_sub.trial_end - now()))::int);
  is_trial := v_sub.status::text = 'trialing';
  is_active := v_sub.status::text IN ('trialing', 'active');
  is_expired := v_sub.status::text IN ('expired', 'cancelled', 'past_due');
  plano_nome := v_sub.p_nome;
  preco_mensal := v_sub.p_preco;
  
  RETURN NEXT;
END;
$$;

-- 7) Inserir plano padrão
INSERT INTO public.tenant_planos (nome, descricao, preco_mensal, destaque, funcionalidades)
VALUES (
  'Profissional',
  'Tudo que você precisa para gerenciar sua barbearia com excelência.',
  49.90,
  true,
  '["Agenda inteligente ilimitada", "Gestão completa de clientes", "Relatórios e estatísticas", "Sistema financeiro completo", "Promoções e cupons", "Disparos via WhatsApp", "Suporte prioritário", "Sem limite de barbeiros"]'::jsonb
);

-- 8) Triggers de updated_at
CREATE TRIGGER set_tenant_assinaturas_updated_at
BEFORE UPDATE ON public.tenant_assinaturas
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_tenant_planos_updated_at
BEFORE UPDATE ON public.tenant_planos
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
