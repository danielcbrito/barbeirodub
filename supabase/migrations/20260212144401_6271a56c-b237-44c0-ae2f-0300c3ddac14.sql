-- Criar cron job para verificar lembretes a cada 10 minutos
SELECT cron.schedule(
  'send-appointment-reminders',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://djtpzvujzmrrslirzwun.supabase.co/functions/v1/send-appointment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
