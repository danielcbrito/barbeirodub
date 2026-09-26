-- 1) Trigger passa a disparar em TODO INSERT em profiles (para capturar email
--    do auth.users mesmo sem cpf/telefone), e continua disparando em UPDATE
--    quando cpf/telefone mudam. registrar_identidade_usada já é idempotente
--    (usa ON CONFLICT), então múltiplas chamadas são seguras.
CREATE OR REPLACE FUNCTION public.trg_registrar_identidade_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT'
     OR (TG_OP = 'UPDATE'
         AND (COALESCE(NEW.cpf,'')      IS DISTINCT FROM COALESCE(OLD.cpf,'')
           OR COALESCE(NEW.telefone,'') IS DISTINCT FROM COALESCE(OLD.telefone,''))) THEN
    PERFORM public.registrar_identidade_usada(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Backfill: registra o email de todos os perfis existentes que ainda não
--    tenham sido capturados em identidades_usadas.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles LOOP
    PERFORM public.registrar_identidade_usada(r.id);
  END LOOP;
END $$;