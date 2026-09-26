ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;

ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_tipo_check CHECK (
  tipo IN (
    'cancelamento',
    'remarcacao',
    'cancelamento_massa',
    'geral',
    'plano_pendente',
    'agendamento_confirmado',
    'atendimento_concluido',
    'lembrete',
    'whatsapp_desconectado'
  )
);