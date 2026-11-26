CREATE TABLE public.barber_pix_availability (
  barbeiro_id uuid PRIMARY KEY REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  can_receive_pix boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.barber_pix_availability TO authenticated;
GRANT ALL ON public.barber_pix_availability TO service_role;
ALTER TABLE public.barber_pix_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read Pix availability"
ON public.barber_pix_availability FOR SELECT TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.refresh_barber_pix_availability(p_barbeiro_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  INSERT INTO public.barber_pix_availability (barbeiro_id, can_receive_pix, updated_at)
  SELECT b.id, (
    b.ativo = true
    AND b.deleted_at IS NULL
    AND (
      (
        a.status = 'approved'
        AND (
          (a.provider = 'woovi' AND wc.app_id IS NOT NULL)
          OR (a.provider = 'mercadopago' AND mc.access_token IS NOT NULL)
        )
      )
      OR (b.id = '767c51a7-7323-4933-8fc5-9a666f6baa7c' AND b.woovi_pix_key IS NOT NULL)
    )
  ), now()
  FROM public.barbeiros b
  LEFT JOIN public.barber_payment_accounts a ON a.barbeiro_id = b.id
  LEFT JOIN public.barber_payment_credentials wc ON wc.barbeiro_id = b.id
  LEFT JOIN public.barber_mp_credentials mc ON mc.barbeiro_id = b.id
  WHERE b.id = p_barbeiro_id
  ON CONFLICT (barbeiro_id) DO UPDATE
  SET can_receive_pix = EXCLUDED.can_receive_pix, updated_at = now();
$function$;
REVOKE ALL ON FUNCTION public.refresh_barber_pix_availability(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_barber_pix_availability(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_barber_pix_availability_from_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_barber_pix_availability(OLD.barbeiro_id);
    RETURN OLD;
  END IF;
  PERFORM public.refresh_barber_pix_availability(NEW.barbeiro_id);
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.sync_barber_pix_availability_from_account() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_barber_pix_availability_from_account() TO service_role;

CREATE OR REPLACE FUNCTION public.sync_barber_pix_availability_from_barber()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.refresh_barber_pix_availability(NEW.id);
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.sync_barber_pix_availability_from_barber() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_barber_pix_availability_from_barber() TO service_role;

CREATE TRIGGER sync_pix_availability_account
AFTER INSERT OR UPDATE OR DELETE ON public.barber_payment_accounts
FOR EACH ROW EXECUTE FUNCTION public.sync_barber_pix_availability_from_account();
CREATE TRIGGER sync_pix_availability_woovi_credential
AFTER INSERT OR UPDATE OR DELETE ON public.barber_payment_credentials
FOR EACH ROW EXECUTE FUNCTION public.sync_barber_pix_availability_from_account();
CREATE TRIGGER sync_pix_availability_mp_credential
AFTER INSERT OR UPDATE OR DELETE ON public.barber_mp_credentials
FOR EACH ROW EXECUTE FUNCTION public.sync_barber_pix_availability_from_account();
CREATE TRIGGER sync_pix_availability_barber
AFTER INSERT OR UPDATE ON public.barbeiros
FOR EACH ROW EXECUTE FUNCTION public.sync_barber_pix_availability_from_barber();

INSERT INTO public.barber_pix_availability (barbeiro_id, can_receive_pix)
SELECT b.id, (
  b.ativo = true
  AND b.deleted_at IS NULL
  AND (
    (
      a.status = 'approved'
      AND (
        (a.provider = 'woovi' AND wc.app_id IS NOT NULL)
        OR (a.provider = 'mercadopago' AND mc.access_token IS NOT NULL)
      )
    )
    OR (b.id = '767c51a7-7323-4933-8fc5-9a666f6baa7c' AND b.woovi_pix_key IS NOT NULL)
  )
)
FROM public.barbeiros b
LEFT JOIN public.barber_payment_accounts a ON a.barbeiro_id = b.id
LEFT JOIN public.barber_payment_credentials wc ON wc.barbeiro_id = b.id
LEFT JOIN public.barber_mp_credentials mc ON mc.barbeiro_id = b.id
ON CONFLICT (barbeiro_id) DO UPDATE
SET can_receive_pix = EXCLUDED.can_receive_pix, updated_at = now();

CREATE OR REPLACE FUNCTION public.validate_barber_can_receive_pix(p_barbeiro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.barber_pix_availability
    WHERE barbeiro_id = p_barbeiro_id AND can_receive_pix = true
  );
$function$;
REVOKE ALL ON FUNCTION public.validate_barber_can_receive_pix(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_barber_can_receive_pix(uuid) TO authenticated;