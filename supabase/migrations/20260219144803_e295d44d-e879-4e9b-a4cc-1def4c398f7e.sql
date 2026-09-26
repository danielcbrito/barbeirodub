-- Drop e recriar a função get_maintenance_status com o campo manutencao_aviso_publico
DROP FUNCTION IF EXISTS public.get_maintenance_status();

CREATE FUNCTION public.get_maintenance_status()
 RETURNS TABLE(
   manutencao_ativa boolean, 
   manutencao_mensagem text, 
   manutencao_inicio_programada timestamp with time zone, 
   manutencao_fim_programada timestamp with time zone, 
   manutencao_aviso_ativo boolean, 
   manutencao_aviso_mensagem text,
   manutencao_aviso_publico text
 )
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(wc.manutencao_ativa, false) AS manutencao_ativa,
    wc.manutencao_mensagem,
    wc.manutencao_inicio_programada,
    wc.manutencao_fim_programada,
    COALESCE(wc.manutencao_aviso_ativo, false) AS manutencao_aviso_ativo,
    wc.manutencao_aviso_mensagem,
    COALESCE(wc.manutencao_aviso_publico, 'ambos') AS manutencao_aviso_publico
  FROM public.webhook_config wc
  ORDER BY wc.updated_at DESC NULLS LAST, wc.created_at DESC NULLS LAST
  LIMIT 1;
$$;