-- Migration: Criar tabela e colunas de formas de pagamento por barbeiro (isolamento individual)
-- Permite que cada barbeiro habilite ou desabilite Pix e Pagamento na Barbearia de forma independente

-- 1. Tabela dedicada para formas de pagamento por barbeiro
CREATE TABLE IF NOT EXISTS public.barbeiro_formas_pagamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id UUID NOT NULL REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  user_id UUID,
  pix_habilitado BOOLEAN NOT NULL DEFAULT true,
  pagamento_barbearia_habilitado BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_barbeiro_formas_pagamento UNIQUE (barbeiro_id)
);

CREATE INDEX IF NOT EXISTS idx_barbeiro_formas_pagamento_barbeiro 
  ON public.barbeiro_formas_pagamento(barbeiro_id);

-- 2. Colunas de fallback direto na tabela barbeiros
ALTER TABLE public.barbeiros ADD COLUMN IF NOT EXISTS pagamento_pix_habilitado BOOLEAN DEFAULT true;
ALTER TABLE public.barbeiros ADD COLUMN IF NOT EXISTS pagamento_barbearia_habilitado BOOLEAN DEFAULT true;

-- 3. Habilitar Row Level Security (RLS)
ALTER TABLE public.barbeiro_formas_pagamento ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de acesso:
-- Qualquer cliente (público ou autenticado) pode ler para saber as opções de checkout do barbeiro
DROP POLICY IF EXISTS "Public e clientes podem ver formas de pagamento dos barbeiros" ON public.barbeiro_formas_pagamento;
CREATE POLICY "Public e clientes podem ver formas de pagamento dos barbeiros"
  ON public.barbeiro_formas_pagamento FOR SELECT
  USING (true);

-- Barbeiros e admins podem gerenciar suas próprias formas de pagamento
DROP POLICY IF EXISTS "Barbeiros e admins podem gerenciar suas formas de pagamento" ON public.barbeiro_formas_pagamento;
CREATE POLICY "Barbeiros e admins podem gerenciar suas formas de pagamento"
  ON public.barbeiro_formas_pagamento FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()
    OR barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'tenant_admin'::app_role)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'tenant_admin'::app_role)
  );

-- Política para informacoes_empresa permitir que o barbeiro atualize suas formas de pagamento
DROP POLICY IF EXISTS "Barbeiros can manage their own payment info" ON public.informacoes_empresa;
CREATE POLICY "Barbeiros can manage their own payment info"
  ON public.informacoes_empresa FOR ALL
  TO authenticated
  USING (chave LIKE 'formas_pagamento_%')
  WITH CHECK (chave LIKE 'formas_pagamento_%');

-- 5. Trigger para atualizar updated_at automaticamente
DROP TRIGGER IF EXISTS update_barbeiro_formas_pagamento_updated_at ON public.barbeiro_formas_pagamento;
CREATE TRIGGER update_barbeiro_formas_pagamento_updated_at
  BEFORE UPDATE ON public.barbeiro_formas_pagamento
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Adicionar à publicação de Realtime
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.barbeiro_formas_pagamento;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
