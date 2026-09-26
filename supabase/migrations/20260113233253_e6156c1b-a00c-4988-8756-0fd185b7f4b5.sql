-- =====================================================
-- CORREÇÃO DE PONTOS DE FIDELIDADE - BACKFILL
-- =====================================================

-- 1. Inserir pontos para usuários que NÃO têm registro na tabela pontos (8 usuários)
INSERT INTO public.pontos (user_id, pontos, promocao_id, last_awarded_at, updated_at)
VALUES 
  ('fec367c9-eb69-4fab-a2a9-05173fd1e20b', 1, '5d14179c-1ec0-4d34-a7aa-cafa680212df', now(), now()),
  ('271977ea-6b08-48fe-8075-46c5dc482503', 1, '5d14179c-1ec0-4d34-a7aa-cafa680212df', now(), now()),
  ('99ca8171-b9f5-4d7f-986b-949dde99c778', 1, '5d14179c-1ec0-4d34-a7aa-cafa680212df', now(), now()),
  ('d3d73cbb-07ae-48d7-9984-ad73d3511ef9', 1, '5d14179c-1ec0-4d34-a7aa-cafa680212df', now(), now()),
  ('f383e5de-adce-4a22-84fb-94087a1e3a4e', 1, '5d14179c-1ec0-4d34-a7aa-cafa680212df', now(), now()),
  ('d18381d9-3c36-4fd5-8c0e-c17f08c438f2', 1, '5d14179c-1ec0-4d34-a7aa-cafa680212df', now(), now()),
  ('dad4ab27-6947-4c1c-a8c3-a47ac56405be', 1, '5d14179c-1ec0-4d34-a7aa-cafa680212df', now(), now()),
  ('12cb26de-fde1-4c4a-92a7-827556595f03', 1, '5d14179c-1ec0-4d34-a7aa-cafa680212df', now(), now())
ON CONFLICT (user_id) DO UPDATE SET pontos = pontos.pontos + 1, last_awarded_at = now(), updated_at = now();

-- 2. Atualizar pontos para 15 usuários que já têm registro (adicionar +1 ponto)
UPDATE public.pontos
SET pontos = pontos + 1, last_awarded_at = now(), updated_at = now()
WHERE user_id IN (
  'c18de679-8c35-4383-ab47-c8fd2af6abd7',
  '4c4d45e3-4318-4c1f-a8c2-b96f7ab7fb17',
  'ef8bb400-9517-45f7-b81c-93d05e2874ea',
  '74f6f1b3-508c-4236-81d9-935f2b207e95',
  '6fb5387c-465d-4a50-801b-e80319bdf160',
  'fde0117a-b9bb-4e38-9132-e096245af670',
  '909b4e5d-eb69-42ed-8af0-e324ef9e8835',
  '7dd17512-7300-43d5-a1a1-590b7e8551d8',
  'f96c5fbc-8228-4459-b83a-97ee6418e489',
  'd15ea77d-813d-4b7d-8af9-68b8792e050d',
  'b980b749-0633-496e-9072-accc7360838f',
  '6305c387-c071-4f42-9bf5-80b0ebcc4fde',
  '2d6ad840-2c85-4080-aa90-0cdff6d82e6a',
  'b65e7234-5978-46bf-9197-b8586e6b8d84',
  '6533e1b3-e674-4086-9662-b5770e1c3146'
);

-- 3. Usuários que completam 5 pontos e ganham resgate:
-- Tulio (a46b3160): tinha 0, ganha 5 = 1 resgate, fica com 0
-- Kaique (9135b3bf): tinha 4, ganha 1 = 5 = 1 resgate, fica com 0
-- Hugo (7f1fe1ce): tinha 4, ganha 1 = 5 = 1 resgate, fica com 0

UPDATE public.pontos
SET pontos = 0, last_awarded_at = now(), updated_at = now()
WHERE user_id IN (
  'a46b3160-c1ca-478c-8a8b-68f50a82d27d',
  '9135b3bf-ed0f-493d-b74c-1e3675d68616',
  '7f1fe1ce-3c29-49a4-a6db-cb098e4b2e1b'
);

-- 4. Criar resgates (corte grátis) para os 3 usuários que completaram 5 pontos
INSERT INTO public.resgates (user_id, promocao_id, status, created_at, expired_at)
VALUES 
  ('a46b3160-c1ca-478c-8a8b-68f50a82d27d', '5d14179c-1ec0-4d34-a7aa-cafa680212df', 'available', now(), now() + interval '90 days'),
  ('9135b3bf-ed0f-493d-b74c-1e3675d68616', '5d14179c-1ec0-4d34-a7aa-cafa680212df', 'available', now(), now() + interval '90 days'),
  ('7f1fe1ce-3c29-49a4-a6db-cb098e4b2e1b', '5d14179c-1ec0-4d34-a7aa-cafa680212df', 'available', now(), now() + interval '90 days');

-- 5. Registrar em log para auditoria
INSERT INTO public.system_logs (level, category, message, details)
VALUES (
  'info',
  'loyalty_backfill',
  'Correção de pontos de fidelidade executada',
  jsonb_build_object(
    'users_with_new_points', 8,
    'users_updated', 15,
    'new_resgates_created', 3,
    'executed_at', now()
  )
);