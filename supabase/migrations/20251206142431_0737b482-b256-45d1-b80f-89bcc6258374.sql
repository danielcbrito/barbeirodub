-- Remover créditos excedentes do Edson de Melo para deixar apenas R$ 45
-- Atual: R$ 195 (8 créditos) → Remover R$ 150 (6 créditos de R$ 25)

DELETE FROM public.creditos
WHERE id IN (
  '90ac4183-22f3-492b-ad70-ce13a7417546',
  '0323c025-de3a-47f8-8f0d-87c5a2134641',
  '49b680d6-4769-4660-b443-eeff7a745ba1',
  'f6b4a488-6fc6-48aa-a703-5a76213f9376',
  'f242ff4b-e0a8-4942-b094-a002d8b71c4b',
  '6f784209-76c0-4317-8feb-1bac2e0eb060'
);