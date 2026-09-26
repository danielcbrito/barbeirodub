-- Fix: The function signature must stay the same to avoid "cannot change return type" error
-- We drop and recreate the functions

DROP FUNCTION IF EXISTS public.get_maintenance_status();
DROP FUNCTION IF EXISTS public.get_maintenance_status_with_ips();

-- Recreate get_maintenance_status to always return the MOST RECENT row in webhook_config
CREATE FUNCTION public.get_maintenance_status()
RETURNS TABLE (
  manutencao_ativa boolean,
  manutencao_mensagem text,
  manutencao_inicio_programada timestamptz,
  manutencao_fim_programada timestamptz,
  manutencao_aviso_ativo boolean,
  manutencao_aviso_mensagem text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(wc.manutencao_ativa, false) AS manutencao_ativa,
    wc.manutencao_mensagem,
    wc.manutencao_inicio_programada,
    wc.manutencao_fim_programada,
    COALESCE(wc.manutencao_aviso_ativo, false) AS manutencao_aviso_ativo,
    wc.manutencao_aviso_mensagem
  FROM public.webhook_config wc
  ORDER BY wc.updated_at DESC NULLS LAST, wc.created_at DESC NULLS LAST
  LIMIT 1;
$$;

-- Recreate get_maintenance_status_with_ips
CREATE FUNCTION public.get_maintenance_status_with_ips()
RETURNS TABLE (
  manutencao_ativa boolean,
  manutencao_mensagem text,
  manutencao_inicio_programada timestamptz,
  manutencao_fim_programada timestamptz,
  manutencao_aviso_ativo boolean,
  manutencao_aviso_mensagem text,
  manutencao_ips_permitidos text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(wc.manutencao_ativa, false) AS manutencao_ativa,
    wc.manutencao_mensagem,
    wc.manutencao_inicio_programada,
    wc.manutencao_fim_programada,
    COALESCE(wc.manutencao_aviso_ativo, false) AS manutencao_aviso_ativo,
    wc.manutencao_aviso_mensagem,
    wc.manutencao_ips_permitidos
  FROM public.webhook_config wc
  ORDER BY wc.updated_at DESC NULLS LAST, wc.created_at DESC NULLS LAST
  LIMIT 1;
$$;

-- Ensure clients can call the functions
GRANT EXECUTE ON FUNCTION public.get_maintenance_status() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_maintenance_status_with_ips() TO anon, authenticated;