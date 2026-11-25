CREATE TABLE public.barber_payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id uuid NOT NULL UNIQUE REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tenant_id uuid,
  full_name text,
  tax_id text,
  tax_type text NOT NULL DEFAULT 'BR:CPF',
  email text,
  phone text,
  pix_key text,
  status text NOT NULL DEFAULT 'draft',
  status_message text,
  woovi_company_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.barber_payment_accounts TO authenticated;
GRANT ALL ON public.barber_payment_accounts TO service_role;
ALTER TABLE public.barber_payment_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Barber reads own payment account" ON public.barber_payment_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Barber inserts own draft" ON public.barber_payment_accounts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'draft');
CREATE POLICY "Barber edits own draft" ON public.barber_payment_accounts FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status IN ('draft','rejected'))
  WITH CHECK (user_id = auth.uid() AND status IN ('draft','rejected'));
CREATE TRIGGER trg_bpa_updated BEFORE UPDATE ON public.barber_payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.barber_payment_credentials (
  barbeiro_id uuid PRIMARY KEY REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  app_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.barber_payment_credentials TO service_role;
ALTER TABLE public.barber_payment_credentials ENABLE ROW LEVEL SECURITY;

-- Pré-cria rascunhos para todos os barbeiros ativos (exceto quem já tem conta própria) usando dados existentes
INSERT INTO public.barber_payment_accounts (barbeiro_id, user_id, tenant_id, full_name, tax_id, phone)
SELECT b.id, b.user_id, b.tenant_id, p.nome, regexp_replace(coalesce(p.cpf,''),'\D','','g'), p.telefone
FROM public.barbeiros b LEFT JOIN public.profiles p ON p.id = b.user_id
WHERE b.ativo = true AND b.user_id IS NOT NULL AND coalesce(p.nome,'') NOT ILIKE 't_lio%'
ON CONFLICT (barbeiro_id) DO NOTHING;