-- Limpar registros relacionados aos 2 encaixes manuais do Pedro Santos (17/02/2026)
DELETE FROM public.logs_agendamentos WHERE agendamento_id IN ('63ff7244-ef78-46cf-b197-f1237e04413c', '561dd10b-4c04-41fb-83e1-8a1e4b9739be');
DELETE FROM public.audit_logs WHERE entity_id IN ('63ff7244-ef78-46cf-b197-f1237e04413c', '561dd10b-4c04-41fb-83e1-8a1e4b9739be');
-- Deletar os agendamentos
DELETE FROM public.agendamentos WHERE id IN ('63ff7244-ef78-46cf-b197-f1237e04413c', '561dd10b-4c04-41fb-83e1-8a1e4b9739be');