-- Migration: Criar infraestrutura de Taxa de Cancelamento e Bloqueio de Cliente
-- Permite que cada barbeiro configure taxa de cancelamento (porcentagem ou valor fixo)
-- e trava o aplicativo do cliente com débito pendente até a quitação.

-- 1. Tabela de configuração de taxa de cancelamento por barbeiro
CREATE TABLE IF NOT EXISTS public.barbeiro_taxa_cancelamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id UUID NOT NULL REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  tenant_id UUID,
  habilitado BOOLEAN NOT NULL DEFAULT false,
  tipo TEXT NOT NULL DEFAULT 'porcentagem' CHECK (tipo IN ('porcentagem', 'fixo')),
  valor NUMERIC(10,2) NOT NULL DEFAULT 20.00,
  horas_antecedencia INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_barbeiro_taxa_cancelamento UNIQUE (barbeiro_id)
);

CREATE INDEX IF NOT EXISTS idx_barbeiro_taxa_cancelamento_barbeiro 
  ON public.barbeiro_taxa_cancelamento(barbeiro_id);

-- 2. Tabela de débitos de cancelamento do cliente (trava o aplicativo até o pagamento)
CREATE TABLE IF NOT EXISTS public.cliente_debitos_cancelamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL,
  barbeiro_id UUID NOT NULL REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  tenant_id UUID,
  agendamento_id UUID,
  valor_taxa NUMERIC(10,2) NOT NULL,
  tipo_taxa TEXT NOT NULL DEFAULT 'porcentagem',
  porcentagem_aplicada NUMERIC(5,2),
  valor_servico_original NUMERIC(10,2),
  motivo TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'dispensado')),
  pix_charge_id TEXT,
  pix_payload TEXT,
  pix_qrcode TEXT,
  pago_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cliente_debitos_cliente_status 
  ON public.cliente_debitos_cancelamento(cliente_id, status);

CREATE INDEX IF NOT EXISTS idx_cliente_debitos_barbeiro 
  ON public.cliente_debitos_cancelamento(barbeiro_id);

-- 3. Habilitar Row Level Security (RLS)
ALTER TABLE public.barbeiro_taxa_cancelamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_debitos_cancelamento ENABLE ROW LEVEL SECURITY;

-- 4. Políticas para barbeiro_taxa_cancelamento
DROP POLICY IF EXISTS "Leitura publica da taxa de cancelamento do barbeiro" ON public.barbeiro_taxa_cancelamento;
CREATE POLICY "Leitura publica da taxa de cancelamento do barbeiro"
  ON public.barbeiro_taxa_cancelamento FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Barbeiros e admins gerenciam sua taxa de cancelamento" ON public.barbeiro_taxa_cancelamento;
CREATE POLICY "Barbeiros e admins gerenciam sua taxa de cancelamento"
  ON public.barbeiro_taxa_cancelamento FOR ALL
  USING (true);

-- 5. Políticas para cliente_debitos_cancelamento
DROP POLICY IF EXISTS "Clientes e barbeiros podem visualizar debitos de cancelamento" ON public.cliente_debitos_cancelamento;
CREATE POLICY "Clientes e barbeiros podem visualizar debitos de cancelamento"
  ON public.cliente_debitos_cancelamento FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Gerenciamento de debitos de cancelamento" ON public.cliente_debitos_cancelamento;
CREATE POLICY "Gerenciamento de debitos de cancelamento"
  ON public.cliente_debitos_cancelamento FOR ALL
  USING (true);

-- 6. Adicionar à publicação de Realtime do Supabase
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.barbeiro_taxa_cancelamento;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cliente_debitos_cancelamento;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
