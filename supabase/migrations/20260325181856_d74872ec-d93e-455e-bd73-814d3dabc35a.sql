
-- ═══════════════════════════════════════════════════════════
-- PASSO 1: Adicionar 'pending_renewal' ao enum subscription_status
-- ═══════════════════════════════════════════════════════════
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'pending_renewal';
