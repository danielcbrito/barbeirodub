-- ═══════════════════════════════════════════════════════════
-- RLS: TI/Admin acesso global a pedidos, pedido_itens e UPDATE em produtos
-- ═══════════════════════════════════════════════════════════

-- TI/Admin podem ver TODOS os pedidos de qualquer tenant
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ti_admin_select_pedidos' AND tablename = 'pedidos'
  ) THEN
    CREATE POLICY "ti_admin_select_pedidos" ON public.pedidos
    FOR SELECT TO authenticated
    USING (
      public.has_role(auth.uid(), 'ti') OR public.has_role(auth.uid(), 'admin')
    );
  END IF;
END $$;

-- TI/Admin podem ver TODOS os itens de pedido
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ti_admin_select_pedido_itens' AND tablename = 'pedido_itens'
  ) THEN
    CREATE POLICY "ti_admin_select_pedido_itens" ON public.pedido_itens
    FOR SELECT TO authenticated
    USING (
      public.has_role(auth.uid(), 'ti') OR public.has_role(auth.uid(), 'admin')
    );
  END IF;
END $$;

-- TI/Admin podem editar produtos (UPDATE, sem DELETE)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ti_admin_update_produtos' AND tablename = 'produtos'
  ) THEN
    CREATE POLICY "ti_admin_update_produtos" ON public.produtos
    FOR UPDATE TO authenticated
    USING (
      public.has_role(auth.uid(), 'ti') OR public.has_role(auth.uid(), 'admin')
    )
    WITH CHECK (
      public.has_role(auth.uid(), 'ti') OR public.has_role(auth.uid(), 'admin')
    );
  END IF;
END $$;

-- TI/Admin podem ver TODAS as reservas de estoque (diagnóstico)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ti_admin_select_reservas_estoque' AND tablename = 'reservas_estoque'
  ) THEN
    CREATE POLICY "ti_admin_select_reservas_estoque" ON public.reservas_estoque
    FOR SELECT TO authenticated
    USING (
      public.has_role(auth.uid(), 'ti') OR public.has_role(auth.uid(), 'admin')
    );
  END IF;
END $$;