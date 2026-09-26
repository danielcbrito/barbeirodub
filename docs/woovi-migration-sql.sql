-- ============================================================
-- WOOVI MIGRATION — Scripts manuais
-- ============================================================
-- 1) Aplicado automaticamente pela migration inicial:
--    - barbeiros.woovi_pix_key TEXT
--    - tabela woovi_charges + RLS
-- ============================================================

-- 2) CLEANUP do Asaas (executar APENAS após validar Woovi em produção por ≥30 dias)
-- ------------------------------------------------------------
-- ALTER TABLE public.barbeiros DROP COLUMN IF EXISTS asaas_account_id;
-- ALTER TABLE public.barbeiros DROP COLUMN IF EXISTS asaas_api_key;
-- ALTER TABLE public.barbeiros DROP COLUMN IF EXISTS asaas_wallet_id;
-- DROP TABLE IF EXISTS public.asaas_webhooks_log CASCADE; -- se existir

-- 3) BACKFILL — migrar barbeiros que já tinham chave Pix cadastrada em chaves_pix
-- ------------------------------------------------------------
UPDATE public.barbeiros b
SET woovi_pix_key = cp.chave
FROM public.chaves_pix cp
WHERE cp.barbeiro_id = b.id
  AND cp.ativa = true
  AND b.woovi_pix_key IS NULL;

-- 4) Após backfill, rodar 1x por barbeiro para criar a subconta na Woovi:
--    chamar a edge function `woovi-create-subaccount` no painel Supabase.
