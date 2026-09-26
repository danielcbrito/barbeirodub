-- Adicionar campo servico_id na tabela planos para vincular o serviço do plano
ALTER TABLE public.planos 
ADD COLUMN servico_id uuid REFERENCES public.servicos(id);

-- Atualizar o plano "Plano Só Corte" para vincular ao serviço "Corte"
UPDATE public.planos 
SET servico_id = '32a57676-8332-4153-8e7e-1d0949041ad8'
WHERE nome ILIKE '%Só Corte%';

-- Atualizar planos que incluem "Corte + Barba" para vincular ao serviço correspondente
UPDATE public.planos 
SET servico_id = '02682d90-dfbc-499c-80b0-d3d9809712aa'
WHERE nome ILIKE '%Corte + Barba%' OR nome ILIKE '%Corte e Barba%';

-- Criar índice para melhorar performance das queries
CREATE INDEX idx_planos_servico_id ON public.planos(servico_id);