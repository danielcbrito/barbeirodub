
-- 1. Restore banner_url (found in storage: avatars/banners/...)
UPDATE public.profiles
SET banner_url = 'https://djtpzvujzmrrslirzwun.supabase.co/storage/v1/object/public/avatars/banners/banner-a46b3160-c1ca-478c-8a8b-68f50a82d27d-1771608486691.webp',
    barbearia_preferida_id = '73d61f2f-b369-41f3-8915-8e6de52d6378'::uuid
WHERE id = 'a46b3160-c1ca-478c-8a8b-68f50a82d27d'::uuid;

-- 2. Restore barber schedule hours from global config (was empty)
INSERT INTO public.configuracoes_horario_barbeiro (
  barbeiro_id, dia_semana, aberto, hora_abertura, hora_fechamento,
  hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos
)
SELECT
  '767c51a7-7323-4933-8fc5-9a666f6baa7c'::uuid,
  g.dia_semana,
  g.aberto,
  LEFT(g.hora_abertura::text, 5),
  LEFT(g.hora_fechamento::text, 5),
  CASE WHEN g.hora_almoco_inicio IS NULL THEN NULL ELSE LEFT(g.hora_almoco_inicio::text, 5) END,
  CASE WHEN g.hora_almoco_fim IS NULL THEN NULL ELSE LEFT(g.hora_almoco_fim::text, 5) END,
  COALESCE(NULLIF(g.delay_entre_servicos, 0), 10)
FROM public.configuracoes_horario g
ON CONFLICT (barbeiro_id, dia_semana) DO NOTHING;

-- 3. Also initialize hours for Pedro Santos barber
INSERT INTO public.configuracoes_horario_barbeiro (
  barbeiro_id, dia_semana, aberto, hora_abertura, hora_fechamento,
  hora_almoco_inicio, hora_almoco_fim, delay_entre_servicos
)
SELECT
  'ee238642-bc38-4de6-ba86-9eed40262fc7'::uuid,
  g.dia_semana,
  g.aberto,
  LEFT(g.hora_abertura::text, 5),
  LEFT(g.hora_fechamento::text, 5),
  CASE WHEN g.hora_almoco_inicio IS NULL THEN NULL ELSE LEFT(g.hora_almoco_inicio::text, 5) END,
  CASE WHEN g.hora_almoco_fim IS NULL THEN NULL ELSE LEFT(g.hora_almoco_fim::text, 5) END,
  COALESCE(NULLIF(g.delay_entre_servicos, 0), 10)
FROM public.configuracoes_horario g
ON CONFLICT (barbeiro_id, dia_semana) DO NOTHING;

-- 4. Create barbeiros_private for Pedro Santos (currently missing)
INSERT INTO public.barbeiros_private (barbeiro_id, updated_at)
VALUES ('ee238642-bc38-4de6-ba86-9eed40262fc7'::uuid, now())
ON CONFLICT (barbeiro_id) DO NOTHING;
