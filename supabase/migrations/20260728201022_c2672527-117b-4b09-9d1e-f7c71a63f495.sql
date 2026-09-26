CREATE OR REPLACE FUNCTION public.validar_identidade_duplicada(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_cpf text; v_tel text; v_email text;
  v_cpf_hash text; v_tel_hash text;
BEGIN
  SELECT regexp_replace(COALESCE(cpf,''), '\D', '', 'g'),
         regexp_replace(COALESCE(telefone,''), '\D', '', 'g')
    INTO v_cpf, v_tel FROM public.profiles WHERE id = p_profile_id;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = p_profile_id;
  v_cpf_hash := CASE WHEN v_cpf = '' THEN NULL ELSE encode(extensions.digest(v_cpf, 'sha256'), 'hex') END;
  v_tel_hash := CASE WHEN v_tel = '' THEN NULL ELSE encode(extensions.digest(v_tel, 'sha256'), 'hex') END;

  -- A simples existência do hash/email em identidades_usadas já basta para
  -- considerar a identidade como duplicada, mesmo que o profile original
  -- que registrou a identidade tenha sido deletado (hard-delete).
  -- O check `primeiro_profile_id <> p_profile_id` evita falso positivo ao
  -- revalidar o próprio perfil que registrou a identidade.
  RETURN EXISTS (
    SELECT 1 FROM public.identidades_usadas iu
    WHERE (iu.primeiro_profile_id IS NULL OR iu.primeiro_profile_id <> p_profile_id)
      AND ( (v_cpf_hash IS NOT NULL AND iu.cpf_hash      = v_cpf_hash)
         OR (v_tel_hash IS NOT NULL AND iu.telefone_hash = v_tel_hash)
         OR (v_email    IS NOT NULL AND iu.email         = v_email) )
  );
END;
$function$;