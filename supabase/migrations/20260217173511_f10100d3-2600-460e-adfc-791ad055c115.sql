CREATE OR REPLACE FUNCTION public.validar_saque(p_user_id uuid, p_barbeiro_id uuid, p_valor numeric)
 RETURNS TABLE(permitido boolean, saldo_atual numeric, motivo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_saldo RECORD;
  v_saques_recentes INT;
BEGIN
  SELECT * INTO v_saldo FROM public.calcular_saldo_barbeiro(p_user_id, p_barbeiro_id);

  saldo_atual := v_saldo.saldo_disponivel;

  IF p_valor <= 0 THEN
    permitido := FALSE;
    motivo := 'Valor do saque deve ser maior que zero';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Temporário para teste: mínimo R$ 1,00
  IF p_valor < 1.00 THEN
    permitido := FALSE;
    motivo := 'Valor mínimo para saque é R$ 1,00';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_valor > v_saldo.saldo_disponivel THEN
    permitido := FALSE;
    motivo := 'Saldo insuficiente para este saque';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_saques_recentes
  FROM saques s
  WHERE s.user_id = p_user_id
    AND s.created_at >= NOW() - INTERVAL '24 hours'
    AND s.status NOT IN ('cancelado', 'falhou');

  IF v_saques_recentes >= 3 THEN
    permitido := FALSE;
    motivo := 'Limite de 3 saques por dia atingido';
    RETURN NEXT;
    RETURN;
  END IF;

  permitido := TRUE;
  motivo := 'Saque autorizado';
  RETURN NEXT;
END;
$function$;