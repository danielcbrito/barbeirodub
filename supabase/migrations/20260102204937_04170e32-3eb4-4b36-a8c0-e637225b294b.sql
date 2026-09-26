-- Adicionar campo para IPs permitidos durante manutenção
ALTER TABLE public.webhook_config 
ADD COLUMN IF NOT EXISTS manutencao_ips_permitidos text[] DEFAULT '{}';

-- Criar tabela para disparos programados
CREATE TABLE IF NOT EXISTS public.disparos_programados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mensagem TEXT NOT NULL,
  contatos_ids TEXT[] NOT NULL DEFAULT '{}',
  data_programada TIMESTAMP WITH TIME ZONE NOT NULL,
  executado BOOLEAN DEFAULT false,
  executado_em TIMESTAMP WITH TIME ZONE,
  resultado JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.disparos_programados ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para disparos_programados (apenas admins)
CREATE POLICY "Admins can manage scheduled dispatches"
ON public.disparos_programados
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Função para obter IP permitidos durante manutenção
CREATE OR REPLACE FUNCTION public.get_maintenance_status_with_ips()
RETURNS TABLE (
  manutencao_ativa boolean,
  manutencao_aviso_ativo boolean,
  manutencao_aviso_mensagem text,
  manutencao_fim_programada text,
  manutencao_inicio_programada text,
  manutencao_mensagem text,
  manutencao_ips_permitidos text[]
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(wc.manutencao_ativa, false),
    COALESCE(wc.manutencao_aviso_ativo, false),
    wc.manutencao_aviso_mensagem,
    wc.manutencao_fim_programada::text,
    wc.manutencao_inicio_programada::text,
    wc.manutencao_mensagem,
    COALESCE(wc.manutencao_ips_permitidos, '{}')
  FROM webhook_config wc
  ORDER BY wc.updated_at DESC NULLS LAST, wc.created_at DESC NULLS LAST
  LIMIT 1;
END;
$$;

-- Função para verificar se um IP está permitido
CREATE OR REPLACE FUNCTION public.is_ip_allowed_maintenance(p_ip text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ips text[];
BEGIN
  SELECT COALESCE(manutencao_ips_permitidos, '{}') INTO v_ips
  FROM webhook_config
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1;
  
  -- Se não há IPs configurados, retorna false
  IF v_ips IS NULL OR array_length(v_ips, 1) IS NULL THEN
    RETURN false;
  END IF;
  
  -- Verifica se o IP está na lista
  RETURN p_ip = ANY(v_ips);
END;
$$;