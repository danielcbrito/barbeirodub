-- Tabela para emails permitidos durante manutenção
CREATE TABLE IF NOT EXISTS public.manutencao_emails_permitidos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.manutencao_emails_permitidos ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can manage allowed emails
CREATE POLICY "Admins can manage allowed emails"
ON public.manutencao_emails_permitidos
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Function to check if email is allowed during maintenance
CREATE OR REPLACE FUNCTION public.is_email_allowed_maintenance(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.manutencao_emails_permitidos
    WHERE LOWER(email) = LOWER(p_email)
  )
$$;