
-- Inserir 1 ponto para Daniel Brito (único usuário de teste)
INSERT INTO pontos (user_id, pontos, promocao_id, last_awarded_at)
VALUES (
  'df8bc0ce-6963-4d3e-9ed6-7ff32d09c0c1',
  1,
  '5d14179c-1ec0-4d34-a7aa-cafa680212df',
  NOW()
)
ON CONFLICT (user_id) 
DO UPDATE SET 
  pontos = 1,
  last_awarded_at = NOW(),
  updated_at = NOW();
