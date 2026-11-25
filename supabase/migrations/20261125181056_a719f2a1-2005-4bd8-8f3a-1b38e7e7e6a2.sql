CREATE OR REPLACE FUNCTION public.create_barber_payment_account_draft()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  SELECT nome, cpf, telefone INTO p FROM public.profiles WHERE id = NEW.user_id;
  IF coalesce(p.nome,'') ILIKE 't_lio%' THEN RETURN NEW; END IF;
  INSERT INTO public.barber_payment_accounts (barbeiro_id, user_id, tenant_id, full_name, tax_id, phone)
  VALUES (NEW.id, NEW.user_id, NEW.tenant_id, p.nome, regexp_replace(coalesce(p.cpf,''),'\D','','g'), p.telefone)
  ON CONFLICT (barbeiro_id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_barber_payment_account_draft() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_barber_payment_account_draft
AFTER INSERT OR UPDATE OF user_id ON public.barbeiros
FOR EACH ROW EXECUTE FUNCTION public.create_barber_payment_account_draft();