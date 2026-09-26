-- Adicionar campos de titular e instituição bancária à tabela chaves_pix
ALTER TABLE public.chaves_pix 
ADD COLUMN IF NOT EXISTS nome_titular text,
ADD COLUMN IF NOT EXISTS instituicao text;