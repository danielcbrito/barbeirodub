
-- Rebuild tenant_clientes from agendamentos history
INSERT INTO public.tenant_clientes (tenant_id, user_id)
SELECT DISTINCT
  '73d61f2f-b369-41f3-8915-8e6de52d6378'::uuid,
  a.user_id
FROM public.agendamentos a
WHERE a.barbeiro_id = '767c51a7-7323-4933-8fc5-9a666f6baa7c'
  AND a.user_id != 'a46b3160-c1ca-478c-8a8b-68f50a82d27d'
ON CONFLICT (tenant_id, user_id) DO NOTHING;
