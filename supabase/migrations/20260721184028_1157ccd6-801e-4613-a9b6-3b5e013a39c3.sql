
-- 1) Novas colunas em ciclos_indicacao para suportar ciclos fixos (recorrentes) e únicos
ALTER TABLE public.ciclos_indicacao
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'unico',
  ADD COLUMN IF NOT EXISTS dia_inicio_mes int,
  ADD COLUMN IF NOT EXISTS dia_fim_mes int,
  ADD COLUMN IF NOT EXISTS ciclo_pai_id uuid REFERENCES public.ciclos_indicacao(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.ciclos_indicacao
    ADD CONSTRAINT ciclos_indicacao_tipo_chk CHECK (tipo IN ('unico','fixo'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.ciclos_indicacao
    ADD CONSTRAINT ciclos_indicacao_dia_chk CHECK (
      (tipo = 'unico') OR
      (tipo = 'fixo'
        AND dia_inicio_mes BETWEEN 1 AND 31
        AND dia_fim_mes    BETWEEN 1 AND 31)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Substitui a RPC de criação para aceitar tipo/dias
DROP FUNCTION IF EXISTS public.criar_ciclo_indicacao(date, date);

CREATE OR REPLACE FUNCTION public.criar_ciclo_indicacao(
  p_tipo text DEFAULT 'unico',
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL,
  p_dia_inicio_mes int DEFAULT NULL,
  p_dia_fim_mes int DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_inicio date;
  v_fim date;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ref_month date;
  v_last_day int;
  v_dia_i int;
  v_dia_f int;
BEGIN
  IF NOT (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'tenant_admin'::app_role)
    OR public.has_role(auth.uid(),'ti'::app_role)
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501';
  END IF;

  IF p_tipo NOT IN ('unico','fixo') THEN
    RAISE EXCEPTION 'tipo inválido';
  END IF;

  IF p_tipo = 'unico' THEN
    IF p_data_inicio IS NULL OR p_data_fim IS NULL THEN
      RAISE EXCEPTION 'datas obrigatórias para ciclo único';
    END IF;
    IF p_data_fim <= p_data_inicio THEN
      RAISE EXCEPTION 'data_fim deve ser posterior a data_inicio';
    END IF;
    v_inicio := p_data_inicio;
    v_fim := p_data_fim;
  ELSE
    -- fixo: calcula a primeira instância a partir do mês corrente
    IF p_dia_inicio_mes IS NULL OR p_dia_fim_mes IS NULL THEN
      RAISE EXCEPTION 'dias do mês obrigatórios para ciclo fixo';
    END IF;
    IF p_dia_inicio_mes < 1 OR p_dia_inicio_mes > 31
       OR p_dia_fim_mes < 1 OR p_dia_fim_mes > 31 THEN
      RAISE EXCEPTION 'dias do mês devem estar entre 1 e 31';
    END IF;

    v_ref_month := date_trunc('month', v_hoje)::date;
    v_last_day := EXTRACT(day FROM (v_ref_month + INTERVAL '1 month - 1 day'))::int;
    v_dia_i := LEAST(p_dia_inicio_mes, v_last_day);
    v_dia_f := LEAST(p_dia_fim_mes, v_last_day);
    v_inicio := v_ref_month + (v_dia_i - 1);
    v_fim := v_ref_month + (v_dia_f - 1);

    -- se já passou o fim deste mês, avança para o próximo
    IF v_fim < v_hoje THEN
      v_ref_month := (v_ref_month + INTERVAL '1 month')::date;
      v_last_day := EXTRACT(day FROM (v_ref_month + INTERVAL '1 month - 1 day'))::int;
      v_dia_i := LEAST(p_dia_inicio_mes, v_last_day);
      v_dia_f := LEAST(p_dia_fim_mes, v_last_day);
      v_inicio := v_ref_month + (v_dia_i - 1);
      v_fim := v_ref_month + (v_dia_f - 1);
    END IF;

    IF v_fim <= v_inicio THEN
      RAISE EXCEPTION 'dia_fim_mes deve ser posterior a dia_inicio_mes';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ciclos_indicacao
    WHERE status = 'ativo'
      AND daterange(data_inicio, data_fim, '[]') && daterange(v_inicio, v_fim, '[]')
  ) THEN
    RAISE EXCEPTION 'Ja existe um ciclo ativo sobreposto ao intervalo informado';
  END IF;

  INSERT INTO public.ciclos_indicacao (
    data_inicio, data_fim, status, criado_por,
    tipo, dia_inicio_mes, dia_fim_mes
  )
  VALUES (
    v_inicio, v_fim, 'ativo', auth.uid(),
    p_tipo,
    CASE WHEN p_tipo='fixo' THEN p_dia_inicio_mes END,
    CASE WHEN p_tipo='fixo' THEN p_dia_fim_mes END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- 3) Apuração automática de ciclos vencidos + renovação para 'fixo'
CREATE OR REPLACE FUNCTION public.apurar_ciclos_vencidos()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_vencedor uuid;
  v_qtd int;
  v_processados int := 0;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ref date;
  v_last int;
  v_di int;
  v_df int;
  v_novo_inicio date;
  v_novo_fim date;
BEGIN
  FOR r IN
    SELECT * FROM public.ciclos_indicacao
    WHERE status = 'ativo' AND data_fim < v_hoje
  LOOP
    -- vencedor: usuário com mais indicações liberadas no período (empate = mais antigo)
    SELECT indicador_id, COUNT(*)::int
      INTO v_vencedor, v_qtd
    FROM public.indicacoes
    WHERE status = 'liberado'
      AND liberado_em::date BETWEEN r.data_inicio AND r.data_fim
    GROUP BY indicador_id
    ORDER BY COUNT(*) DESC, MIN(criado_em) ASC
    LIMIT 1;

    UPDATE public.ciclos_indicacao
       SET status = 'apurado',
           vencedor_id = v_vencedor,
           quantidade_indicacoes_vencedor = COALESCE(v_qtd,0),
           apurado_em = now()
     WHERE id = r.id;

    -- renovação automática para ciclos fixos
    IF r.tipo = 'fixo' AND r.dia_inicio_mes IS NOT NULL AND r.dia_fim_mes IS NOT NULL THEN
      v_ref := date_trunc('month', v_hoje)::date;
      v_last := EXTRACT(day FROM (v_ref + INTERVAL '1 month - 1 day'))::int;
      v_di := LEAST(r.dia_inicio_mes, v_last);
      v_df := LEAST(r.dia_fim_mes, v_last);
      v_novo_inicio := v_ref + (v_di - 1);
      v_novo_fim := v_ref + (v_df - 1);

      -- se este mês já passou, próximo mês
      IF v_novo_fim < v_hoje THEN
        v_ref := (v_ref + INTERVAL '1 month')::date;
        v_last := EXTRACT(day FROM (v_ref + INTERVAL '1 month - 1 day'))::int;
        v_di := LEAST(r.dia_inicio_mes, v_last);
        v_df := LEAST(r.dia_fim_mes, v_last);
        v_novo_inicio := v_ref + (v_di - 1);
        v_novo_fim := v_ref + (v_df - 1);
      END IF;

      -- evita duplicar se já existir ciclo ativo sobreposto
      IF NOT EXISTS (
        SELECT 1 FROM public.ciclos_indicacao
        WHERE status='ativo'
          AND daterange(data_inicio, data_fim, '[]') && daterange(v_novo_inicio, v_novo_fim, '[]')
      ) THEN
        INSERT INTO public.ciclos_indicacao (
          data_inicio, data_fim, status, criado_por,
          tipo, dia_inicio_mes, dia_fim_mes, ciclo_pai_id
        ) VALUES (
          v_novo_inicio, v_novo_fim, 'ativo', r.criado_por,
          'fixo', r.dia_inicio_mes, r.dia_fim_mes, r.id
        );
      END IF;
    END IF;

    v_processados := v_processados + 1;
  END LOOP;

  RETURN v_processados;
END;
$function$;

-- 4) Agenda apuração diária às 00:10 (America/Sao_Paulo ≈ 03:10 UTC)
DO $$ BEGIN
  PERFORM cron.unschedule('apurar_ciclos_vencidos_diario');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'apurar_ciclos_vencidos_diario',
  '10 3 * * *',
  $$SELECT public.apurar_ciclos_vencidos();$$
);
