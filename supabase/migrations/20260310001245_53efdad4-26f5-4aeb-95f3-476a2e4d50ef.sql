-- Add missing FK from barbeiros(user_id) to profiles(id)
-- This enables PostgREST to resolve the join profiles!user_id
ALTER TABLE public.barbeiros
  ADD CONSTRAINT barbeiros_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id)
  ON DELETE SET NULL;