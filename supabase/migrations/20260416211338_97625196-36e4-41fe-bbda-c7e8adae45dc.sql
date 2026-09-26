
-- Remover job anterior se existir
DO $$
BEGIN
  PERFORM cron.unschedule('pix-auto-confirm-worker-job');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Agendar worker para rodar a cada minuto
SELECT cron.schedule(
  'pix-auto-confirm-worker-job',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://djtpzvujzmrrslirzwun.supabase.co/functions/v1/pix-auto-confirm-worker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqdHB6dnVqem1ycnNsaXJ6d3VuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2OTUwMTcsImV4cCI6MjA3ODI3MTAxN30.7rWUhWV7d5pdvEjTrnddBzo8gsRZBFrO6JtvDDpksb8"}'::jsonb,
    body := jsonb_build_object('trigger', 'cron', 'time', now())
  );
  $$
);
