
-- Tabela para registrar confirmações mensais de pagamento na barbearia
CREATE TABLE public.pagamentos_plano_barbearia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assinatura_id uuid NOT NULL REFERENCES public.assinaturas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  barbeiro_id uuid REFERENCES public.barbeiros(id),
  confirmado_por uuid NOT NULL,
  valor numeric NOT NULL,
  competencia date NOT NULL,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_pagamentos_plano_barbearia_assinatura ON public.pagamentos_plano_barbearia(assinatura_id);
CREATE INDEX idx_pagamentos_plano_barbearia_user ON public.pagamentos_plano_barbearia(user_id);
CREATE UNIQUE INDEX idx_pagamentos_plano_barbearia_unique ON public.pagamentos_plano_barbearia(assinatura_id, competencia);

-- RLS
ALTER TABLE public.pagamentos_plano_barbearia ENABLE ROW LEVEL SECURITY;

-- Barbeiros e admins podem ver pagamentos dos seus clientes
CREATE POLICY "barbers_view_plan_payments"
  ON public.pagamentos_plano_barbearia
  FOR SELECT
  TO authenticated
  USING (
    barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'tenant_admin')
  );

-- Barbeiros e admins podem inserir confirmações
CREATE POLICY "barbers_insert_plan_payments"
  ON public.pagamentos_plano_barbearia
  FOR INSERT
  TO authenticated
  WITH CHECK (
    confirmado_por = auth.uid()
    AND (
      barbeiro_id IN (SELECT id FROM public.barbeiros WHERE user_id = auth.uid())
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'tenant_admin')
    )
  );
