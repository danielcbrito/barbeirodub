-- Habilitar REPLICA IDENTITY FULL para capturar dados completos nas atualizações
ALTER TABLE public.agendamentos REPLICA IDENTITY FULL;
ALTER TABLE public.pending_bookings REPLICA IDENTITY FULL;

-- Adicionar tabelas à publicação realtime (se ainda não estiverem)
DO $$
BEGIN
  -- Verificar se a publicação existe
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Adicionar agendamentos se não estiver
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'agendamentos'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.agendamentos;
    END IF;
    
    -- Adicionar pending_bookings se não estiver
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'pending_bookings'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_bookings;
    END IF;
  END IF;
END $$;