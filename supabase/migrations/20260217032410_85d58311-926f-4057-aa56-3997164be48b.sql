
-- Tabela para armazenar durações personalizadas de serviços por barbeiro
CREATE TABLE public.barbeiro_servico_duracao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  barbeiro_id UUID NOT NULL REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  servico_id UUID NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  duracao_personalizada INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barbeiro_id, servico_id)
);

-- Índices para performance
CREATE INDEX idx_barbeiro_servico_duracao_barbeiro ON public.barbeiro_servico_duracao(barbeiro_id);
CREATE INDEX idx_barbeiro_servico_duracao_servico ON public.barbeiro_servico_duracao(servico_id);

-- RLS
ALTER TABLE public.barbeiro_servico_duracao ENABLE ROW LEVEL SECURITY;

-- Barbeiros podem ver suas próprias durações
CREATE POLICY "Barbeiros podem ver suas durações"
  ON public.barbeiro_servico_duracao FOR SELECT
  TO authenticated
  USING (
    barbeiro_id IN (
      SELECT id FROM public.barbeiros WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- Barbeiros podem inserir suas durações
CREATE POLICY "Barbeiros podem inserir suas durações"
  ON public.barbeiro_servico_duracao FOR INSERT
  TO authenticated
  WITH CHECK (
    barbeiro_id IN (
      SELECT id FROM public.barbeiros WHERE user_id = auth.uid()
    )
  );

-- Barbeiros podem atualizar suas durações
CREATE POLICY "Barbeiros podem atualizar suas durações"
  ON public.barbeiro_servico_duracao FOR UPDATE
  TO authenticated
  USING (
    barbeiro_id IN (
      SELECT id FROM public.barbeiros WHERE user_id = auth.uid()
    )
  );

-- Barbeiros podem deletar suas durações
CREATE POLICY "Barbeiros podem deletar suas durações"
  ON public.barbeiro_servico_duracao FOR DELETE
  TO authenticated
  USING (
    barbeiro_id IN (
      SELECT id FROM public.barbeiros WHERE user_id = auth.uid()
    )
  );

-- Admin pode tudo
CREATE POLICY "Admin acesso total barbeiro_servico_duracao"
  ON public.barbeiro_servico_duracao FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger para updated_at
CREATE TRIGGER update_barbeiro_servico_duracao_updated_at
  BEFORE UPDATE ON public.barbeiro_servico_duracao
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Política para que qualquer autenticado possa ler (necessário para booking flow)
CREATE POLICY "Autenticados podem ver durações para agendamento"
  ON public.barbeiro_servico_duracao FOR SELECT
  TO authenticated
  USING (true);
