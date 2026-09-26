-- Seed existing TI/admin users
INSERT INTO ti_usuarios (user_id, email, nome, ativo) VALUES
  ('a46b3160-c1ca-478c-8a8b-68f50a82d27d', 'barbeariasdub@gmail.com', 'Tulio', true),
  ('b654b4cb-3f20-4599-892e-0dab415d6539', 'ti@dub.com', 'Suporte TI', true);

-- Give all permissions to existing users
INSERT INTO ti_permissoes (user_id, perm_clientes, perm_usuarios, perm_barbearias, perm_tenants, perm_agendamentos, perm_financeiro, perm_notificacoes, perm_webhooks, perm_dispositivos, perm_manutencao, perm_logs, perm_agendadas, perm_monitoramento, perm_suporte_ia, perm_impersonar) VALUES
  ('a46b3160-c1ca-478c-8a8b-68f50a82d27d', true, true, true, true, true, true, true, true, true, true, true, true, true, true, true),
  ('b654b4cb-3f20-4599-892e-0dab415d6539', true, true, true, true, true, true, true, true, true, true, true, true, true, true, true);