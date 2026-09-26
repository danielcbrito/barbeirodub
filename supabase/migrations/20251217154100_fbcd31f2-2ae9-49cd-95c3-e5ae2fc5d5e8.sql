-- Criar resgate (corte grátis) para Daniel Brito
INSERT INTO public.resgates (user_id, promocao_id, status, expired_at)
VALUES (
  'df8bc0ce-6963-4d3e-9ed6-7ff32d09c0c1',
  '5d14179c-1ec0-4d34-a7aa-cafa680212df',
  'available',
  NOW() + INTERVAL '90 days'
);

-- Zerar os pontos (já que completou os 5)
UPDATE public.pontos 
SET pontos = 0, updated_at = NOW() 
WHERE user_id = 'df8bc0ce-6963-4d3e-9ed6-7ff32d09c0c1';