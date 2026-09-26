
DROP FUNCTION IF EXISTS public.get_tenant_pedidos_admin(uuid);

CREATE OR REPLACE FUNCTION public.get_tenant_pedidos_admin(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(row_data ORDER BY row_data->>'created_at' DESC)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'numero_pedido', p.numero_pedido,
      'status', p.status,
      'valor_total', p.valor_total,
      'subtotal', p.subtotal,
      'desconto', p.desconto,
      'total', p.total,
      'forma_pagamento', p.forma_pagamento,
      'payment_method', p.payment_method,
      'observacoes_cliente', p.observacoes_cliente,
      'observacoes_admin', p.observacoes_admin,
      'asaas_payment_id', p.asaas_payment_id,
      'pix_qr_code', p.pix_qr_code,
      'pix_copia_cola', p.pix_copia_cola,
      'paid_at', p.paid_at,
      'cancelled_at', p.cancelled_at,
      'cancelado_em', p.cancelado_em,
      'created_at', p.created_at,
      'updated_at', p.updated_at,
      'reservation_expires_at', p.reservation_expires_at,
      'cliente', jsonb_build_object(
        'id', pr.id,
        'nome', pr.nome,
        'telefone', pr.telefone,
        'foto_url', pr.foto_url
      ),
      'itens', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', pi.id,
          'produto_id', pi.produto_id,
          'nome_produto', pi.nome_produto,
          'quantidade', pi.quantidade,
          'preco_unitario', pi.preco_unitario,
          'subtotal', pi.subtotal
        ))
        FROM public.pedido_itens pi
        WHERE pi.pedido_id = p.id
      ), '[]'::jsonb)
    ) AS row_data
    FROM public.pedidos p
    LEFT JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.tenant_id = p_tenant_id
  ) sub;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
