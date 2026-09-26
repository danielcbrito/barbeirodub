-- Adicionar campo de telefone na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN telefone text;

COMMENT ON COLUMN public.profiles.telefone IS 'Telefone do usuário com DDD';