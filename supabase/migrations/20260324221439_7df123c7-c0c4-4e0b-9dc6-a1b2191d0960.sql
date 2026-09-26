
DROP FUNCTION IF EXISTS public.get_all_lojas_stats();

CREATE OR REPLACE FUNCTION public.get_all_lojas_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'global', jsonb_build_object(
      'total_lojas_ativas', (
        SELECT COUNT(DISTINCT tenant_id) FROM public.produtos WHERE status = 'active'
      ),
      'total_produtos', (
        SELECT COUNT(*) FROM public.produtos WHERE status = 'active'
      ),
      'pedidos_hoje', (
        SELECT COUNT(*) FROM public.pedidos WHERE created_at::date = current_date
      ),
      'receita_hoje', (
        SELECT COALESCE(SUM(COALESCE(total, valor_total)), 0) FROM public.pedidos
        WHERE created_at::date = current_date AND status IN ('paid', 'preparing', 'ready_pickup', 'picked_up')
      )
    ),
    'tenants', COALESCE((
      SELECT jsonb_agg(row_data ORDER BY row_data->>'receita_mes' DESC NULLS LAST)
      FROM (
        SELECT jsonb_build_object(
          'tenant_id', t.id,
          'tenant_nome', t.nome,
          'total_produtos', COALESCE(pr.cnt, 0),
          'estoque_baixo', COALESCE(pr.low_stock, 0),
          'pedidos_mes', COALESCE(pe.cnt_mes, 0),
          'receita_mes', COALESCE(pe.receita_mes, 0)
        ) AS row_data
        FROM public.tenants t
        LEFT JOIN (
          SELECT tenant_id,
                 COUNT(*) FILTER (WHERE status = 'active') AS cnt,
                 COUNT(*) FILTER (WHERE status = 'active' AND estoque <= estoque_minimo) AS low_stock
          FROM public.produtos GROUP BY tenant_id
        ) pr ON pr.tenant_id = t.id
        LEFT JOIN (
          SELECT tenant_id,
                 COUNT(*) AS cnt_mes,
                 COALESCE(SUM(COALESCE(total, valor_total)) FILTER (
                   WHERE status IN ('paid', 'preparing', 'ready_pickup', 'picked_up')
                 ), 0) AS receita_mes
          FROM public.pedidos
          WHERE created_at >= date_trunc('month', current_date)
          GROUP BY tenant_id
        ) pe ON pe.tenant_id = t.id
        WHERE t.ativo = true AND (COALESCE(pr.cnt, 0) > 0 OR COALESCE(pe.cnt_mes, 0) > 0)
      ) sub
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
