DO $mig$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_barber_boot_bundle'
  LIMIT 1;

  IF v_def IS NULL THEN
    RAISE NOTICE 'get_barber_boot_bundle não encontrada';
    RETURN;
  END IF;

  -- "GROUP BY true" é inválido no Postgres (non-integer constant in GROUP BY).
  -- HAVING com agregados funciona sem GROUP BY.
  v_def := replace(v_def, 'GROUP BY true', '');

  EXECUTE v_def;
END
$mig$;