
-- Remove plan usage for the 07/03 appointment
DELETE FROM public.plano_agendamentos_usos
WHERE agendamento_id = 'b1b5871e-a5e5-47bb-bf0f-843c7cd5d369';

-- Remove the 07/03 appointment itself
DELETE FROM public.agendamentos
WHERE id = 'b1b5871e-a5e5-47bb-bf0f-843c7cd5d369';
