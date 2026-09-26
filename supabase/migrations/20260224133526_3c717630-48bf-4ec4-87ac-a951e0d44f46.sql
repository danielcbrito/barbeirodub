-- Definir Pedro como menor de idade (nascimento em 2010)
UPDATE barbeiros_private 
SET data_nascimento = '2010-05-15'
WHERE barbeiro_id = 'ee238642-bc38-4de6-ba86-9eed40262fc7';

-- Caso não exista registro em barbeiros_private para Pedro, criar
INSERT INTO barbeiros_private (barbeiro_id, data_nascimento)
VALUES ('ee238642-bc38-4de6-ba86-9eed40262fc7', '2010-05-15')
ON CONFLICT (barbeiro_id) DO UPDATE SET data_nascimento = '2010-05-15';