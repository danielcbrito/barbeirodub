
-- Função para suspender automaticamente assinaturas vencidas (pagamento na barbearia)
CREATE OR REPLACE FUNCTION public.auto_suspend_expired_cash_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.assinaturas
  SET status = 'suspended',
      updated_at = now()
  WHERE payment_method = 'cash'
    AND status = 'active'
    AND next_billing_date IS NOT NULL
    AND next_billing_date < CURRENT_DATE;
END;
$$;
