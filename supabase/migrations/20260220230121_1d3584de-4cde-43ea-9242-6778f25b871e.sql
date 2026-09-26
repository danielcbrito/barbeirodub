-- Desativar manutenção
UPDATE webhook_config SET manutencao_ativa = false, updated_at = now() WHERE id = (SELECT id FROM webhook_config ORDER BY updated_at DESC LIMIT 1);

-- Autorizar o dispositivo ativo mais recente do admin
INSERT INTO dispositivos_autorizados (device_fingerprint, device_name, device_type, autorizado_por, descricao)
VALUES ('vzuz3yig49', 'Chrome - Windows (1536x864)', 'desktop', 'a46b3160-c1ca-478c-8a8b-68f50a82d27d', 'Autorizado em 20/02/2026')
ON CONFLICT (device_fingerprint) DO NOTHING;