
-- Atualizar data de nascimento do Pedro para maior de idade (liberar carteira)
UPDATE public.barbeiros_private 
SET data_nascimento = '2000-05-15'
WHERE barbeiro_id = 'ee238642-bc38-4de6-ba86-9eed40262fc7';

-- Marcar setup como completo
UPDATE public.barbeiros 
SET setup_completed = true
WHERE id = 'ee238642-bc38-4de6-ba86-9eed40262fc7';
