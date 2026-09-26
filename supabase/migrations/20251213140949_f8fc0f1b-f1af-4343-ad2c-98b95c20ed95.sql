-- =====================================================
-- SECURITY FIX: Remove public access to webhook_config
-- =====================================================
-- Problem: Anyone can read the webhook URL, exposing automation endpoints
-- Solution: Remove public SELECT policy, keep admin-only access

DROP POLICY IF EXISTS "Todos podem ver webhook config para enviar eventos" ON public.webhook_config;

-- =====================================================
-- SECURITY FIX: Remove user ability to INSERT/UPDATE credits
-- =====================================================
-- Problem: Users can create fake credits for themselves (fraud)
-- Solution: Remove INSERT/UPDATE policies, keep only SELECT for users

DROP POLICY IF EXISTS "Usuários podem inserir seus próprios créditos" ON public.creditos;
DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios créditos" ON public.creditos;

-- =====================================================
-- SECURITY FIX: Restrict email_confirmation_tokens INSERT
-- =====================================================
-- Problem: Anyone can insert tokens (flood attack)
-- Solution: Only allow inserts via service_role (edge functions)

DROP POLICY IF EXISTS "Anyone can insert tokens" ON public.email_confirmation_tokens;

-- Create a more restrictive policy for service_role only
-- Note: service_role bypasses RLS, so no explicit policy needed for it
-- This effectively means only edge functions with service_role can insert tokens