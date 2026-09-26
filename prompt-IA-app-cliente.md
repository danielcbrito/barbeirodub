# Prompt Estratégico: Sincronização de Agendamentos de Plano em Tempo Real (v3)

Este prompt foi atualizado para lidar com a arquitetura de silenciamento de notificações e evitar erros de restrição de unicidade no banco de dados.

---

## Objetivo
Garantir que o Aplicativo do Cliente reflita instantaneamente agendamentos de plano, mantendo a consistência dos dados e silenciando notificações irrelevantes durante conversões manuais feitas pelo barbeiro.

## Lógica Técnica para a IA do Cliente
Ao lidar com agendamentos e usos de plano:

1. **Tipos de Agendamento de Plano**: O sistema agora utiliza três tipos principais que devem ser tratados visualmente como "Incluso no Plano":
   - `plano`: Agendamento padrão via plano.
   - `assinatura_silenciosa`: Usado durante a ativação inicial do plano para incluir o corte do dia.
   - `plano_registro_interno`: Agendamento gerado automaticamente pelo banco quando o barbeiro debita um corte manual.
   
   **Ação**: No card de agendamento, se o tipo for qualquer um destes, oculte o preço e exiba o selo de "Plano".

2. **Silenciamento de Notificações**: Os tipos `assinatura_silenciosa` e `plano_registro_interno` estão configurados no banco para NÃO disparar notificações automáticas de "Novo Agendamento" no WhatsApp. Não é necessário implementar lógica adicional de silenciamento no frontend, pois o banco já gerencia isso.

3. **Prevenção de Erros de Banco (Duplicate Key)**: 
   - Se o App do Cliente precisar registrar um uso manualmente, deve usar `upsert` com `onConflict: ['agendamento_id']`.
   - No entanto, a recomendação atual é permitir que os triggers do banco gerenciem o registro de uso automaticamente ao detectar um agendamento com `payment_method: 'plano'`.

4. **Sincronização Realtime**: Mantenha o listener nas tabelas `assinaturas`, `plano_agendamentos_usos` e `agendamentos` filtrando por `user_id`. Isso garante que o dashboard do cliente atualize o card de progresso do plano e a lista de cortes assim que o barbeiro fizer qualquer alteração.

---
*Esta configuração garante estabilidade total e evita o erro de restrição de unicidade (duplicate key) que ocorria anteriormente.*
