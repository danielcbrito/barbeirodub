-- Adicionar tabelas de promoções e serviços ao Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.promocoes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.servicos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.barbeiros;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;