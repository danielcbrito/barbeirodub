ALTER TABLE public.pix_charges
ADD COLUMN IF NOT EXISTS confidence_score smallint
  CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100));

COMMENT ON COLUMN public.pix_charges.confidence_score IS
  'Nível de confiança (0–100) da heurística de confirmação automática. NULL = não calculado. >=75 alta, 40–74 média, <40 baixa.';