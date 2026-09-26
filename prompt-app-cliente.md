# Prompt para Configuração do Aplicativo do Cliente

Para garantir que o aplicativo do cliente reflita corretamente as novas funcionalidades de plano em tempo real, utilize as seguintes instruções no prompt da sua outra IA:

---

## Objetivo: Sincronização e UI de Planos de Assinatura

**1. Sincronização em Tempo Real (Realtime):**
- Configure ouvintes do Supabase Realtime nas tabelas `assinaturas` e `agendamentos` filtrados pelo `user_id` do cliente logado.
- Sempre que houver um evento de `INSERT` ou `UPDATE` na tabela `assinaturas`, invalide os caches e recarregue os dados de status da assinatura.
- Se uma assinatura for detectada como `status: 'active'`, esconda imediatamente o componente/banner de Programa de Fidelidade e mostre o `PlanTrackerCard`.

**2. Interface de Agendamentos (Histórico):**
- Na listagem de agendamentos (`Meus Agendamentos`), verifique o campo `tipo_agendamento`.
- Se `tipo_agendamento === 'assinatura'`, exiba um badge ou ícone visual indicando que aquele corte faz parte do plano contratado.
- Certifique-se de que agendamentos criados automaticamente pelo barbeiro ao ativar um plano (com `status: 'completed'`) apareçam no topo da lista com as informações corretas de serviço, barbeiro e barbearia.

**3. Lógica de Banner (Fidelidade vs. Plano):**
- Implemente uma regra de precedência: `Plano Ativo > Programa de Fidelidade`.
- Se o cliente tiver uma assinatura ativa ou pendente de confirmação, o banner de pontos de fidelidade deve ser substituído pelo banner de progresso do plano.

---

Este prompt garante que a experiência do cliente seja fluida e que ele perceba instantaneamente quando um barbeiro ativar seu plano na barbearia.
