-- Remover políticas permissivas e substituir por service_role-only
DROP POLICY IF EXISTS "Sistema insere cobranças (via edge fn)" ON public.efi_pix_charges;
DROP POLICY IF EXISTS "Sistema atualiza cobranças (via edge fn)" ON public.efi_pix_charges;
DROP POLICY IF EXISTS "Sistema gerencia repasses" ON public.efi_pix_payouts;
DROP POLICY IF EXISTS "Sistema insere eventos webhook" ON public.efi_webhook_events;

-- Apenas service_role (Edge Functions com SERVICE_ROLE_KEY) escreve
CREATE POLICY "Service role manages charges"
  ON public.efi_pix_charges FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role manages payouts"
  ON public.efi_pix_payouts FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role manages webhook events"
  ON public.efi_webhook_events FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Recriar view sem SECURITY DEFINER (herda RLS das tabelas base)
DROP VIEW IF EXISTS public.efi_barbeiro_extrato;
CREATE VIEW public.efi_barbeiro_extrato
WITH (security_invoker = true) AS
SELECT
  c.barbeiro_id,
  c.id AS charge_id,
  c.txid,
  c.valor AS valor_recebido,
  c.status AS charge_status,
  c.descricao,
  c.created_at AS recebido_em,
  c.paid_at,
  p.id AS payout_id,
  p.valor AS valor_repassado,
  p.status AS payout_status,
  p.completed_at AS repassado_em,
  p.error_message AS payout_erro
FROM public.efi_pix_charges c
LEFT JOIN public.efi_pix_payouts p ON p.charge_id = c.id;