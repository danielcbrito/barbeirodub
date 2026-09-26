
-- 0. Criar profile para Pedro Siqueira (não existia)
INSERT INTO public.profiles (id, nome, telefone)
VALUES ('5f8930bc-5d4f-4136-b97c-27a38730f994'::uuid, 'Pedro Santos', '11959637439')
ON CONFLICT (id) DO NOTHING;

-- 1. Vincular barbeiro Pedro Santos ao user_id correto
UPDATE public.barbeiros
SET user_id = '5f8930bc-5d4f-4136-b97c-27a38730f994'::uuid
WHERE id = 'ee238642-bc38-4de6-ba86-9eed40262fc7'::uuid
  AND user_id IS NULL;

-- 2. Preencher dados privados do Túlio
UPDATE public.barbeiros_private
SET nome_completo = 'Tulio Santos',
    cpf = '25205848358',
    telefone = '11983916423',
    email = 'barbeariasdub@gmail.com',
    updated_at = now()
WHERE barbeiro_id = '767c51a7-7323-4933-8fc5-9a666f6baa7c'::uuid;

-- 3. Preencher dados privados do Pedro Santos
UPDATE public.barbeiros_private
SET nome_completo = 'Pedro Siqueira',
    email = 'pedosiqueira123@gmail.com',
    telefone = '11959637439',
    updated_at = now()
WHERE barbeiro_id = 'ee238642-bc38-4de6-ba86-9eed40262fc7'::uuid;

-- 4. Restaurar telefone no perfil da Barbearia DUB
UPDATE public.profiles
SET telefone = '11952263002'
WHERE id = 'a46b3160-c1ca-478c-8a8b-68f50a82d27d'::uuid
  AND (telefone IS NULL OR telefone = '');

-- 5. Criar wallet_balance para o dono da barbearia
INSERT INTO public.wallet_balances (user_id, balance)
VALUES ('a46b3160-c1ca-478c-8a8b-68f50a82d27d'::uuid, 0)
ON CONFLICT (user_id) DO NOTHING;

-- 6. Role 'barber' para Pedro Santos (enum correto)
INSERT INTO public.user_roles (user_id, role)
VALUES ('5f8930bc-5d4f-4136-b97c-27a38730f994'::uuid, 'barber')
ON CONFLICT (user_id, role) DO NOTHING;

-- 7. Barbearia preferida do Pedro = DUB
UPDATE public.profiles
SET barbearia_preferida_id = '73d61f2f-b369-41f3-8915-8e6de52d6378'::uuid
WHERE id = '5f8930bc-5d4f-4136-b97c-27a38730f994'::uuid
  AND barbearia_preferida_id IS NULL;
