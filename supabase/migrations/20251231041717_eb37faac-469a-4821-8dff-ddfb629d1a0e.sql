-- Adicionar campo de manutenção na tabela webhook_config (já existe uma config geral)
ALTER TABLE public.webhook_config 
ADD COLUMN IF NOT EXISTS manutencao_ativa boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS manutencao_mensagem text DEFAULT 'Estamos realizando melhorias para você. Voltamos em breve!';

-- Garantir que existe pelo menos uma linha de configuração
INSERT INTO public.webhook_config (id, manutencao_ativa, manutencao_mensagem)
VALUES (gen_random_uuid(), false, 'Estamos realizando melhorias para você. Voltamos em breve!')
ON CONFLICT DO NOTHING;