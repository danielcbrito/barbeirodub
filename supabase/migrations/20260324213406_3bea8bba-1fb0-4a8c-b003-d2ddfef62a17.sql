
-- RPCs para módulo Loja

CREATE OR REPLACE FUNCTION public.get_tenant_produtos_loja(p_tenant_id UUID)
RETURNS TABLE (
  id UUID, tenant_id UUID, nome TEXT, descricao TEXT,
  preco NUMERIC, preco_original NUMERIC, estoque INTEGER,
  estoque_disponivel BIGINT, estoque_minimo INTEGER,
  categoria TEXT, imagens TEXT[], destaque BOOLEAN, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT
    p.id, p.tenant_id, p.nome, p.descricao,
    p.preco, p.preco_original, p.estoque,
    (p.estoque - COALESCE((SELECT SUM(r.quantidade) FROM reservas_estoque r WHERE r.produto_id = p.id AND r.expires_at > now()), 0))::BIGINT,
    p.estoque_minimo, p.categoria, p.imagens, p.destaque, p.created_at
  FROM produtos p
  WHERE p.tenant_id = p_tenant_id AND p.ativo = true
  ORDER BY p.destaque DESC, p.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_pedidos_admin(p_tenant_id UUID)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_result JSON;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR (public.has_role(auth.uid(), 'tenant_admin'::app_role) AND EXISTS (SELECT 1 FROM barbeiros b WHERE b.user_id = auth.uid() AND b.tenant_id = p_tenant_id AND b.deleted_at IS NULL))) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  SELECT json_agg(row_to_json(t)) INTO v_result FROM (
    SELECT pl.*, pr.nome AS cliente_nome, pr.telefone AS cliente_telefone,
      (SELECT json_agg(json_build_object('id', it.id, 'nome_produto', it.nome_produto, 'preco_unitario', it.preco_unitario, 'quantidade', it.quantidade, 'subtotal', it.subtotal)) FROM pedido_itens it WHERE it.pedido_id = pl.id) AS itens
    FROM pedidos pl LEFT JOIN profiles pr ON pr.id = pl.cliente_id
    WHERE pl.tenant_id = p_tenant_id ORDER BY pl.created_at DESC LIMIT 200
  ) t;
  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_meus_pedidos_loja(p_cliente_id UUID)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_result JSON;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_cliente_id THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT json_agg(row_to_json(t)) INTO v_result FROM (
    SELECT pl.*, tn.nome AS tenant_nome,
      (SELECT json_agg(json_build_object('id', it.id, 'nome_produto', it.nome_produto, 'preco_unitario', it.preco_unitario, 'quantidade', it.quantidade, 'subtotal', it.subtotal)) FROM pedido_itens it WHERE it.pedido_id = pl.id) AS itens
    FROM pedidos pl LEFT JOIN tenants tn ON tn.id = pl.tenant_id
    WHERE pl.cliente_id = p_cliente_id ORDER BY pl.created_at DESC
  ) t;
  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_loja_stats_admin(p_tenant_id UUID)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_result JSON;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR (public.has_role(auth.uid(), 'tenant_admin'::app_role) AND EXISTS (SELECT 1 FROM barbeiros b WHERE b.user_id = auth.uid() AND b.tenant_id = p_tenant_id AND b.deleted_at IS NULL))) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  SELECT json_build_object(
    'total_produtos_ativos', (SELECT COUNT(*) FROM produtos WHERE tenant_id = p_tenant_id AND ativo = true),
    'estoque_baixo_count', (SELECT COUNT(*) FROM produtos WHERE tenant_id = p_tenant_id AND ativo = true AND estoque <= estoque_minimo AND estoque > 0),
    'sem_estoque_count', (SELECT COUNT(*) FROM produtos WHERE tenant_id = p_tenant_id AND ativo = true AND estoque = 0),
    'pedidos_hoje', (SELECT COUNT(*) FROM pedidos WHERE tenant_id = p_tenant_id AND created_at::date = CURRENT_DATE),
    'receita_hoje', COALESCE((SELECT SUM(total) FROM pedidos WHERE tenant_id = p_tenant_id AND created_at::date = CURRENT_DATE AND status NOT IN ('cancelado', 'aguardando_pagamento')), 0),
    'pedidos_pendentes_acao', (SELECT COUNT(*) FROM pedidos WHERE tenant_id = p_tenant_id AND status IN ('pago', 'em_separacao'))
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_all_lojas_stats()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_result JSON;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT json_agg(row_to_json(t)) INTO v_result FROM (
    SELECT tn.id AS tenant_id, tn.nome AS nome_tenant,
      (SELECT COUNT(*) FROM produtos p WHERE p.tenant_id = tn.id AND p.ativo = true) AS total_produtos,
      (SELECT COUNT(*) FROM pedidos pl WHERE pl.tenant_id = tn.id AND pl.created_at >= date_trunc('month', CURRENT_DATE)) AS pedidos_mes,
      COALESCE((SELECT SUM(pl.total) FROM pedidos pl WHERE pl.tenant_id = tn.id AND pl.created_at >= date_trunc('month', CURRENT_DATE) AND pl.status NOT IN ('cancelado', 'aguardando_pagamento')), 0) AS receita_mes
    FROM tenants tn WHERE EXISTS (SELECT 1 FROM produtos p WHERE p.tenant_id = tn.id) ORDER BY receita_mes DESC
  ) t;
  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

CREATE OR REPLACE FUNCTION public.clean_expired_reservas_loja()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN DELETE FROM public.reservas_estoque WHERE expires_at < now(); END;
$$;
