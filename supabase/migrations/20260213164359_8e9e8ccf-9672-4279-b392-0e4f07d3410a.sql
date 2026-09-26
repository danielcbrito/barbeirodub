
-- Deletar agendamentos cancelados vinculados aos barbeiros removidos
DELETE FROM agendamentos WHERE barbeiro_id IN ('27dd281c-c7da-4967-b54b-9528ff5e72c0', '8dd7c1aa-ce45-41d8-a00d-580ad7c196bc');

-- Limpar tabelas relacionadas
DELETE FROM pending_bookings WHERE barbeiro_id IN ('27dd281c-c7da-4967-b54b-9528ff5e72c0', '8dd7c1aa-ce45-41d8-a00d-580ad7c196bc');
DELETE FROM horarios_excepcionais_barbeiro WHERE barbeiro_id IN ('27dd281c-c7da-4967-b54b-9528ff5e72c0', '8dd7c1aa-ce45-41d8-a00d-580ad7c196bc');
DELETE FROM configuracoes_horario_barbeiro WHERE barbeiro_id IN ('27dd281c-c7da-4967-b54b-9528ff5e72c0', '8dd7c1aa-ce45-41d8-a00d-580ad7c196bc');
DELETE FROM comissoes WHERE barbeiro_id IN ('27dd281c-c7da-4967-b54b-9528ff5e72c0', '8dd7c1aa-ce45-41d8-a00d-580ad7c196bc');
DELETE FROM barbeiros_private WHERE barbeiro_id IN ('27dd281c-c7da-4967-b54b-9528ff5e72c0', '8dd7c1aa-ce45-41d8-a00d-580ad7c196bc');
DELETE FROM barbeiro_google_tokens WHERE barbeiro_id IN ('27dd281c-c7da-4967-b54b-9528ff5e72c0', '8dd7c1aa-ce45-41d8-a00d-580ad7c196bc');
DELETE FROM barbeiro_avaliacoes WHERE barber_id IN ('27dd281c-c7da-4967-b54b-9528ff5e72c0', '8dd7c1aa-ce45-41d8-a00d-580ad7c196bc');

-- Deletar os barbeiros
DELETE FROM barbeiros WHERE id IN ('27dd281c-c7da-4967-b54b-9528ff5e72c0', '8dd7c1aa-ce45-41d8-a00d-580ad7c196bc');
