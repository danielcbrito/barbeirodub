
-- ═══════════════════════════════════════════════════════════
-- PARTE 1: Schema changes (ALTER TABLE + Triggers)
-- ═══════════════════════════════════════════════════════════

-- PRODUTOS: adicionar colunas multi-tenant
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS preco_original NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS estoque_minimo INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS imagens TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS destaque BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'outros';

UPDATE public.produtos SET tenant_id = (SELECT id FROM public.tenants LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE public.produtos ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.produtos ALTER COLUMN descricao DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_produtos_tenant_ativo ON public.produtos (tenant_id, ativo);

-- PEDIDOS: adicionar colunas multi-tenant
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS cliente_id UUID,
  ADD COLUMN IF NOT EXISTS numero_pedido TEXT,
  ADD COLUMN IF NOT EXISTS forma_pagamento TEXT,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS desconto NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS observacoes_cliente TEXT,
  ADD COLUMN IF NOT EXISTS observacoes_admin TEXT,
  ADD COLUMN IF NOT EXISTS asaas_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS pix_qr_code TEXT,
  ADD COLUMN IF NOT EXISTS pix_copia_cola TEXT,
  ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ;

UPDATE public.pedidos
SET tenant_id = (SELECT id FROM public.tenants LIMIT 1),
    cliente_id = user_id,
    forma_pagamento = COALESCE(payment_method, 'pix'),
    subtotal = COALESCE(valor_total, 0),
    total = COALESCE(valor_total, 0),
    numero_pedido = 'DUB-LEGACY-' || LEFT(id::TEXT, 5)
WHERE tenant_id IS NULL;

ALTER TABLE public.pedidos ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_status ON public.pedidos (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON public.pedidos (cliente_id);

-- PEDIDO_ITENS: snapshot
ALTER TABLE public.pedido_itens ADD COLUMN IF NOT EXISTS nome_produto TEXT;
UPDATE public.pedido_itens pi SET nome_produto = p.nome FROM public.produtos p WHERE pi.produto_id = p.id AND pi.nome_produto IS NULL;

-- SEQUENCE
CREATE SEQUENCE IF NOT EXISTS pedido_numero_seq START 1;

-- TRIGGERS
CREATE OR REPLACE FUNCTION public.validate_produto_preco()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NEW.preco < 0 THEN RAISE EXCEPTION 'preco must be >= 0'; END IF;
  IF NEW.estoque < 0 THEN RAISE EXCEPTION 'estoque must be >= 0'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.gerar_numero_pedido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NEW.numero_pedido IS NULL OR NEW.numero_pedido = '' THEN
    NEW.numero_pedido := 'DUB-' || LPAD(nextval('pedido_numero_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gerar_numero_pedido ON public.pedidos;
CREATE TRIGGER trg_gerar_numero_pedido BEFORE INSERT ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.gerar_numero_pedido();

CREATE OR REPLACE FUNCTION public.set_cancelado_em_pedidos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NEW.status = 'cancelado' AND OLD.status IS DISTINCT FROM 'cancelado' THEN
    NEW.cancelado_em := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_cancelado_em_pedidos ON public.pedidos;
CREATE TRIGGER trg_set_cancelado_em_pedidos BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.set_cancelado_em_pedidos();

CREATE OR REPLACE FUNCTION public.liberar_estoque_on_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NEW.status = 'cancelado' AND OLD.status IS DISTINCT FROM 'cancelado' THEN
    IF OLD.status IN ('pago', 'em_separacao', 'pronto_retirada') THEN
      UPDATE public.produtos p SET estoque = p.estoque + it.quantidade FROM public.pedido_itens it WHERE it.pedido_id = NEW.id AND p.id = it.produto_id;
    END IF;
    DELETE FROM public.reservas_estoque WHERE pedido_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_liberar_estoque_cancel ON public.pedidos;
CREATE TRIGGER trg_liberar_estoque_cancel AFTER UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.liberar_estoque_on_cancel();

CREATE OR REPLACE FUNCTION public.confirmar_estoque_on_pago()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NEW.status = 'pago' AND OLD.status = 'aguardando_pagamento' THEN
    UPDATE public.produtos p SET estoque = p.estoque - it.quantidade FROM public.pedido_itens it WHERE it.pedido_id = NEW.id AND p.id = it.produto_id;
    DELETE FROM public.reservas_estoque WHERE pedido_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_confirmar_estoque_pago ON public.pedidos;
CREATE TRIGGER trg_confirmar_estoque_pago AFTER UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.confirmar_estoque_on_pago();

-- RLS — Produtos
DROP POLICY IF EXISTS "Admins can manage produtos" ON public.produtos;
DROP POLICY IF EXISTS "Authenticated can view active produtos" ON public.produtos;

CREATE POLICY "produtos_select_public" ON public.produtos FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "produtos_manage_owner" ON public.produtos FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.has_role(auth.uid(), 'tenant_admin'::app_role) AND EXISTS (SELECT 1 FROM public.barbeiros b WHERE b.user_id = auth.uid() AND b.tenant_id = produtos.tenant_id AND b.deleted_at IS NULL))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.has_role(auth.uid(), 'tenant_admin'::app_role) AND EXISTS (SELECT 1 FROM public.barbeiros b WHERE b.user_id = auth.uid() AND b.tenant_id = produtos.tenant_id AND b.deleted_at IS NULL))
);

-- RLS — Pedidos
DROP POLICY IF EXISTS "Users can view own pedidos" ON public.pedidos;

CREATE POLICY "pedidos_select" ON public.pedidos FOR SELECT TO authenticated
USING (
  cliente_id = auth.uid() OR user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.has_role(auth.uid(), 'tenant_admin'::app_role) AND tenant_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.barbeiros b WHERE b.user_id = auth.uid() AND b.tenant_id = pedidos.tenant_id AND b.deleted_at IS NULL))
);

CREATE POLICY "pedidos_insert" ON public.pedidos FOR INSERT TO authenticated
WITH CHECK (cliente_id = auth.uid() OR user_id = auth.uid());

CREATE POLICY "pedidos_update" ON public.pedidos FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.has_role(auth.uid(), 'tenant_admin'::app_role) AND tenant_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.barbeiros b WHERE b.user_id = auth.uid() AND b.tenant_id = pedidos.tenant_id AND b.deleted_at IS NULL))
);

-- RLS — Pedido Itens
DROP POLICY IF EXISTS "Users can view own pedido_itens" ON public.pedido_itens;

CREATE POLICY "pedido_itens_select" ON public.pedido_itens FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_itens.pedido_id AND (p.cliente_id = auth.uid() OR p.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role) OR (public.has_role(auth.uid(), 'tenant_admin'::app_role) AND p.tenant_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.barbeiros b WHERE b.user_id = auth.uid() AND b.tenant_id = p.tenant_id AND b.deleted_at IS NULL)))));

CREATE POLICY "pedido_itens_insert" ON public.pedido_itens FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_itens.pedido_id AND (p.cliente_id = auth.uid() OR p.user_id = auth.uid())));

-- Reservas: remover acesso direto
DROP POLICY IF EXISTS "Users can view own reservas_estoque" ON public.reservas_estoque;

-- STORAGE
INSERT INTO storage.buckets (id, name, public) VALUES ('produto-fotos', 'produto-fotos', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "produto_fotos_select_public" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'produto-fotos');
CREATE POLICY "produto_fotos_insert_auth" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'produto-fotos');
CREATE POLICY "produto_fotos_delete_owner" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'produto-fotos' AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'tenant_admin'::app_role)));
