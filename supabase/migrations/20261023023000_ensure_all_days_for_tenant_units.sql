-- ==============================================================================
-- Migration: Garantir que todas as unidades tenham os 7 dias completos configurados
-- e evitar falsos positivos de "barbearia fechada" para barbeiros
-- ==============================================================================

-- 1. Inserir dias faltantes em configuracoes_horario_unidade a partir do template configuracoes_horario
INSERT INTO public.configuracoes_horario_unidade (
  tenant_id,
  unidade_id,
  dia_semana,
  aberto,
  hora_abertura,
  hora_fechamento,
  hora_almoco_inicio,
  hora_almoco_fim,
  delay_entre_servicos
)
SELECT 
  u.tenant_id,
  u.id AS unidade_id,
  ch.dia_semana,
  ch.aberto,
  ch.hora_abertura,
  ch.hora_fechamento,
  ch.hora_almoco_inicio,
  ch.hora_almoco_fim,
  ch.delay_entre_servicos
FROM public.tenant_unidades u
CROSS JOIN public.configuracoes_horario ch
WHERE NOT EXISTS (
  SELECT 1 
  FROM public.configuracoes_horario_unidade chu
  WHERE chu.unidade_id = u.id 
    AND chu.dia_semana = ch.dia_semana
)
ON CONFLICT DO NOTHING;

-- 2. Inserir dias faltantes a nível de tenant (onde unidade_id IS NULL)
INSERT INTO public.configuracoes_horario_unidade (
  tenant_id,
  unidade_id,
  dia_semana,
  aberto,
  hora_abertura,
  hora_fechamento,
  hora_almoco_inicio,
  hora_almoco_fim,
  delay_entre_servicos
)
SELECT 
  t.id AS tenant_id,
  NULL AS unidade_id,
  ch.dia_semana,
  ch.aberto,
  ch.hora_abertura,
  ch.hora_fechamento,
  ch.hora_almoco_inicio,
  ch.hora_almoco_fim,
  ch.delay_entre_servicos
FROM public.tenants t
CROSS JOIN public.configuracoes_horario ch
WHERE NOT EXISTS (
  SELECT 1 
  FROM public.configuracoes_horario_unidade chu
  WHERE chu.tenant_id = t.id 
    AND chu.unidade_id IS NULL
    AND chu.dia_semana = ch.dia_semana
)
ON CONFLICT DO NOTHING;
