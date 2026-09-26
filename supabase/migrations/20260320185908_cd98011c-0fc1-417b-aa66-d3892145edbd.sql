
-- Tabela de mudanças agendadas pelo painel TI
CREATE TABLE public.ti_mudancas_agendadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operador_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  operador_email TEXT,
  titulo TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT NOT NULL DEFAULT 'geral',
  payload JSONB DEFAULT '{}'::jsonb,
  payload_antes JSONB,
  payload_depois JSONB,
  status TEXT NOT NULL DEFAULT 'pendente',
  aplicar_em TIMESTAMPTZ NOT NULL,
  aplicada_em TIMESTAMPTZ,
  cancelada_em TIMESTAMPTZ,
  erro_msg TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_ti_mudancas_status ON public.ti_mudancas_agendadas(status);
CREATE INDEX idx_ti_mudancas_aplicar_em ON public.ti_mudancas_agendadas(aplicar_em);

-- RLS
ALTER TABLE public.ti_mudancas_agendadas ENABLE ROW LEVEL SECURITY;

-- Apenas admin/ti podem ver e manipular
CREATE POLICY "ti_mudancas_select" ON public.ti_mudancas_agendadas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'ti')
    )
  );

CREATE POLICY "ti_mudancas_insert" ON public.ti_mudancas_agendadas
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'ti')
    )
  );

CREATE POLICY "ti_mudancas_update" ON public.ti_mudancas_agendadas
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'ti')
    )
  );

-- Trigger updated_at
CREATE TRIGGER set_ti_mudancas_updated_at
  BEFORE UPDATE ON public.ti_mudancas_agendadas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ti_mudancas_agendadas;
