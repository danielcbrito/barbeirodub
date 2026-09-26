-- Corrigir tipo da chave PIX que é telefone mas estava cadastrada como 'aleatoria'
UPDATE chaves_pix 
SET tipo = 'telefone', updated_at = now()
WHERE id = '4c3f422e-e373-4d2b-8218-ed0c48ec1b93' 
  AND chave = '11959637439';
