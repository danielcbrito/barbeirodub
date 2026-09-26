-- Refunded charges devem SAIR do bloqueado (não somar mais ao saldo bloqueado do barbeiro).
-- Apenas charges PAID com released_at IS NULL contam como bloqueado (aguardando conclusão).
CREATE OR REPLACE FUNCTION public.woovi_blocked_centavos(p_barbeiro uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(value_centavos), 0)::bigint
  FROM public.woovi_charges
  WHERE barbeiro_id = p_barbeiro
    AND status = 'PAID'
    AND released_at IS NULL;
$$;