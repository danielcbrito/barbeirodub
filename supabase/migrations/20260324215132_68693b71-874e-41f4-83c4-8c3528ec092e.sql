
-- Adicionar coluna pix_copia_cola ao pedidos (se não existir)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'pix_copia_cola'
  ) THEN
    ALTER TABLE public.pedidos ADD COLUMN pix_copia_cola text;
  END IF;
END $$;

-- Adicionar coluna asaas_payment_id ao pedidos (se não existir)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'asaas_payment_id'
  ) THEN
    ALTER TABLE public.pedidos ADD COLUMN asaas_payment_id text;
  END IF;
END $$;

-- Adicionar coluna asaas_customer_id ao profiles (se não existir)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'asaas_customer_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN asaas_customer_id text;
  END IF;
END $$;
