-- Criar tenant para o admin global Túlio (Barbearia DUB)
INSERT INTO public.tenants (nome, slug, owner_user_id, onboarding_completed)
VALUES ('Barbearia DUB', 'barbearia-dub', 'a46b3160-c1ca-478c-8a8b-68f50a82d27d', true);

-- Vincular o barbeiro do Túlio ao tenant recém-criado
UPDATE public.barbeiros
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'barbearia-dub' LIMIT 1)
WHERE id = '767c51a7-7323-4933-8fc5-9a666f6baa7c'
  AND tenant_id IS NULL;
