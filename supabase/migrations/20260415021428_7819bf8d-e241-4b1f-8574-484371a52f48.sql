
-- 1. Fix user role: cliente → tenant_admin
DELETE FROM public.user_roles
WHERE user_id = 'a46b3160-c1ca-478c-8a8b-68f50a82d27d'::uuid
  AND role = 'cliente';

INSERT INTO public.user_roles (user_id, role)
VALUES ('a46b3160-c1ca-478c-8a8b-68f50a82d27d'::uuid, 'tenant_admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Restore profile avatar
UPDATE public.profiles
SET avatar_url = 'https://djtpzvujzmrrslirzwun.supabase.co/storage/v1/object/public/barber-photos/avatars/767c51a7-7323-4933-8fc5-9a666f6baa7c.jpg'
WHERE id = 'a46b3160-c1ca-478c-8a8b-68f50a82d27d'::uuid;

-- 3. Create barbeiros_private record
INSERT INTO public.barbeiros_private (barbeiro_id, email, updated_at)
VALUES (
  '767c51a7-7323-4933-8fc5-9a666f6baa7c'::uuid,
  'barbeariasdub@gmail.com',
  now()
)
ON CONFLICT (barbeiro_id) DO UPDATE
SET email = 'barbeariasdub@gmail.com',
    updated_at = now();
