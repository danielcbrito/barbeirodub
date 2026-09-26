# Auditoria Woovi — Saldo, Em espera e Estornos

## User
- A cobrança Pix cancelada não deve permanecer em **Em espera**.
- Quando o cliente cancela uma reserva/agendamento pago, o barbeiro deve ver o lançamento como **Reembolsado/Estornado** no movimento e no extrato.
- O total de **Em espera** representa apenas Pix pago de corte ainda não finalizado e ainda ativo.

## Frontend
- `WooviWalletSheet` agora mistura o histórico remoto com o histórico local de `woovi_charges`, garantindo que estornos locais apareçam mesmo se a edge function antiga não retornar `REFUNDED`.
- O cálculo local de bloqueado ignora cobranças ligadas a agendamentos cancelados/excluídos.
- A aba **Em espera** mantém a mesma estrutura visual do saldo e lista lançamentos com badges de `Em espera` ou `Reembolsado`.

## Backend Supabase
- `sync_woovi_charge_on_agendamento_status` libera cobrança quando o agendamento vira `completed`.
- A mesma função marca como `REFUNDED` quando o agendamento vira `cancelled_by_user`, `cancelled_by_admin` ou `excluido`.
- `sync_woovi_charge_on_pending_booking_delete` marca cobranças `book-...` como `REFUNDED` antes de apagar uma reserva pendente.
- `woovi_blocked_centavos` só soma cobranças pagas sem `released_at` que ainda tenham reserva/agendamento ativo.

## Critical flow — Booking/Pix/Cancellation
1. Cliente cria reserva Pix → nasce `pending_bookings`.
2. Pix pago → `woovi_charges` fica pago e entra em **Em espera**.
3. Corte finalizado → agendamento `completed` define `released_at` e libera saldo para saque.
4. Cliente cancela antes da finalização → cobrança vira `REFUNDED` e sai de **Em espera**.
5. Se a reserva pendente for apagada sem agendamento final, a trigger em `pending_bookings` também estorna a cobrança local.

## Diagnóstico confirmado
- A cobrança R$ 2,90 estava como `PAID`, `released_at = null`, `agendamento_id = null` e `correlation_id = book-dc63a8c3-...`.
- A reserva pendente correspondente já não existia, então era uma cobrança órfã e não deveria compor **Em espera**.
- A cobrança foi atualizada para `REFUNDED`; `woovi_blocked_centavos` retornou `0` para esse barbeiro.

## External Services
- A correção local reflete o estorno no app; reembolso financeiro real na Woovi depende do fluxo operacional/webhook disponível na integração Woovi.