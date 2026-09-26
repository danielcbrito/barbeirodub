-- Índices compostos p/ consultas quentes
CREATE INDEX IF NOT EXISTS idx_agendamentos_data_status
  ON public.agendamentos (data, status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_barbeiro_status_data
  ON public.agendamentos (barbeiro_id, status, data DESC);
CREATE INDEX IF NOT EXISTS idx_agendamentos_user_data
  ON public.agendamentos (user_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_agendamentos_unidade_data
  ON public.agendamentos (unidade_id, data DESC)
  WHERE unidade_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pagamentos_agendamento_id
  ON public.pagamentos (agendamento_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status_created
  ON public.pagamentos (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pagamentos_user_id
  ON public.pagamentos (user_id);

CREATE INDEX IF NOT EXISTS idx_promocoes_tenant_ativo
  ON public.promocoes (tenant_id, ativo, data_fim DESC);
CREATE INDEX IF NOT EXISTS idx_promocoes_ativo_periodo
  ON public.promocoes (ativo, data_inicio, data_fim);

CREATE INDEX IF NOT EXISTS idx_notificacoes_user_lida_created
  ON public.notificacoes (user_id, lida, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pending_bookings_expires
  ON public.pending_bookings (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pix_charges_user_created
  ON public.pix_charges (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created
  ON public.wallet_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_entries_data
  ON public.financial_entries (data DESC);
CREATE INDEX IF NOT EXISTS idx_financial_entries_appointment
  ON public.financial_entries (related_appointment_id)
  WHERE related_appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_logs_agendamentos_agendamento_ts
  ON public.logs_agendamentos (agendamento_id, "timestamp" DESC);

-- Limpeza segura de logs
CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS TABLE (table_name text, rows_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count bigint;
BEGIN
  DELETE FROM public.webhook_logs WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'webhook_logs'; rows_deleted := v_count; RETURN NEXT;

  DELETE FROM public.system_logs WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'system_logs'; rows_deleted := v_count; RETURN NEXT;

  DELETE FROM public.ai_actions_log WHERE created_at < now() - interval '60 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'ai_actions_log'; rows_deleted := v_count; RETURN NEXT;

  DELETE FROM public.audit_logs WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'audit_logs'; rows_deleted := v_count; RETURN NEXT;

  DELETE FROM public.agendamento_lembretes_log
   WHERE scheduled_for < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'agendamento_lembretes_log'; rows_deleted := v_count; RETURN NEXT;

  DELETE FROM public.logs_agendamentos WHERE "timestamp" < now() - interval '90 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'logs_agendamentos'; rows_deleted := v_count; RETURN NEXT;

  DELETE FROM public.efi_webhook_events WHERE processed_at < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'efi_webhook_events'; rows_deleted := v_count; RETURN NEXT;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_logs() TO service_role;

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_old_logs_daily') THEN
      PERFORM cron.unschedule('cleanup_old_logs_daily');
    END IF;
    PERFORM cron.schedule(
      'cleanup_old_logs_daily',
      '0 4 * * *',
      'SELECT public.cleanup_old_logs();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END
$outer$;