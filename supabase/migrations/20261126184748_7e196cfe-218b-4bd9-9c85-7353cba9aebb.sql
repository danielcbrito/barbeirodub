-- Desvincula as subcontas antigas sem apagar cobranças, pagamentos ou extratos.
UPDATE public.barbeiros
SET
  woovi_pix_key = NULL,
  woovi_pix_key_type = NULL,
  woovi_subaccount_name = NULL,
  woovi_auto_withdraw_enabled = false,
  banco_nome = NULL,
  conta_configurada = false,
  conta_financeira_id = NULL,
  updated_at = now()
WHERE id <> '767c51a7-7323-4933-8fc5-9a666f6baa7c'
  AND (
    woovi_pix_key IS NOT NULL
    OR woovi_pix_key_type IS NOT NULL
    OR woovi_subaccount_name IS NOT NULL
    OR woovi_auto_withdraw_enabled = true
    OR banco_nome IS NOT NULL
    OR conta_configurada = true
    OR conta_financeira_id IS NOT NULL
  );

-- Fonte segura para os aplicativos de cliente: somente a conta do próprio barbeiro libera Pix.
CREATE OR REPLACE FUNCTION public.validate_barber_can_receive_pix(p_barbeiro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.barbeiros b
    LEFT JOIN public.barber_payment_accounts a ON a.barbeiro_id = b.id
    LEFT JOIN public.barber_payment_credentials wc ON wc.barbeiro_id = b.id
    LEFT JOIN public.barber_mp_credentials mc ON mc.barbeiro_id = b.id
    WHERE b.id = p_barbeiro_id
      AND b.ativo = true
      AND b.deleted_at IS NULL
      AND (
        (
          a.status = 'approved'
          AND (
            (a.provider = 'woovi' AND wc.app_id IS NOT NULL)
            OR (a.provider = 'mercadopago' AND mc.access_token IS NOT NULL)
          )
        )
        OR (
          b.id = '767c51a7-7323-4933-8fc5-9a666f6baa7c'
          AND b.woovi_pix_key IS NOT NULL
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.validate_barber_can_receive_pix(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_barber_can_receive_pix(uuid) TO authenticated;