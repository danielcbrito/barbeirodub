# Integração Woovi (OpenPix) — Documentação Técnica

> Status: ATIVA — substitui o Asaas como gateway Pix principal
> Última atualização: 2026-06-22

---

## 1. Camadas da Arquitetura

### 1.1 User
- **Cliente**: escaneia QR Code Pix no app após confirmar agendamento.
- **Barbeiro**: cadastra chave Pix → recebe pagamentos automaticamente em subconta → saca para sua própria chave.
- **Admin/Owner**: monitora cobranças e saques via painel financeiro.

### 1.2 Frontend (React + Vite)
| Componente | Responsabilidade |
|---|---|
| `WooviPixSheet` (novo) | Exibe QR Code + brCode + polling de status |
| `FinancialOverview` / `CarteiraScreen` | Mostra saldo via `woovi-get-balance` |
| `FinancialSaque` | Inicia saque via `woovi-withdraw` (após PIN) |
| Onboarding barbeiro (`BarberSettingsPage`) | Chama `woovi-create-subaccount` ao salvar chave Pix |

### 1.3 Backend — Supabase Edge Functions
| Função | Método | Auth | Descrição |
|---|---|---|---|
| `woovi-create-subaccount` | POST | JWT | Cria subconta Woovi vinculada à chave Pix |
| `woovi-create-charge` | POST | JWT | Gera cobrança Pix com split SUB_ACCOUNT |
| `woovi-get-balance` | GET | JWT | Consulta saldo da subconta do barbeiro logado |
| `woovi-withdraw` | POST | JWT + PIN financeiro | Solicita saque para chave Pix |
| `woovi-webhook` | POST | público (HMAC) | Recebe eventos `OPENPIX:CHARGE_COMPLETED` |

Cliente compartilhado: `supabase/functions/_shared/woovi-client.ts` (`wooviFetch(path, init)`).

### 1.4 Database (Supabase)
| Tabela / Coluna | Função |
|---|---|
| `barbeiros.woovi_pix_key` (TEXT) | Chave Pix usada como identificador da subconta |
| `woovi_charges` | Histórico de cobranças (correlation_id ↔ agendamento_id) |
| `agendamentos.status` | Atualizado p/ `confirmado` no webhook de pagamento |
| `wallet_transactions` | Crédito automático no extrato do barbeiro |
| `saques` | Registro do saque (metodo = `pix_woovi`) |
| `financeiro_auth_sessions` | Sessão de PIN exigida para saque (15 min) |

### 1.5 Serviços Externos
- **Woovi API** — `https://api.woovi.com`
  - Auth header: `Authorization: <WOOVI_APP_ID>` (secret runtime).
  - Endpoints usados:
    - `POST /api/v1/subaccount`
    - `POST /api/v1/charge` (com `splits[].splitType=SPLIT_SUB_ACCOUNT`)
    - `GET /api/v1/subaccount/{pixKey}`
    - `POST /api/v1/subaccount/{pixKey}/withdraw`
- **Webhook a configurar no painel Woovi:**
  - URL: `https://djtpzvujzmrrslirzwun.supabase.co/functions/v1/woovi-webhook`
  - Eventos: `OPENPIX:CHARGE_COMPLETED`, `OPENPIX:TRANSACTION_RECEIVED`

---

## 2. Fluxos Críticos

### 2.1 Auth (sem alteração)
Mesmo fluxo Supabase Auth atual. Apenas barbeiros com `woovi_pix_key != NULL` podem receber/sacar.

### 2.2 Onboarding do Barbeiro
```
[Barber UI] salvar chave Pix
   → invoke('woovi-create-subaccount', { barbeiro_id, pix_key })
       → wooviFetch POST /api/v1/subaccount  { name, pixKey }
       → UPDATE barbeiros SET woovi_pix_key = $1
   → toast sucesso
```
**Erros:**
- `MISSING_FIELDS` → faltou pix_key.
- `WOOVI_ERROR` (status 4xx Woovi) → exibir mensagem original; comum: chave inválida.

### 2.3 Booking / Pagamento
```
[Cliente] confirma agendamento (status = pendente_pagamento)
   → invoke('woovi-create-charge', { agendamento_id })
       → busca agendamento + barbeiro.woovi_pix_key
       → wooviFetch POST /api/v1/charge { correlationID, value, splits }
       → UPSERT woovi_charges (idempotente por correlation_id)
   → frontend exibe QR Code (WooviPixSheet) + polling

[Cliente] paga Pix
   → Woovi → POST /functions/v1/woovi-webhook
       event: OPENPIX:CHARGE_COMPLETED
       → UPDATE woovi_charges status='COMPLETED', paid_at=now
       → UPDATE agendamentos status='confirmado'
       → INSERT wallet_transactions (credito)
       → Realtime push para frontend
```
**Erros:**
- Barbeiro sem subconta → charge gerada **sem split** (cai na conta principal Woovi; ajustar manualmente).
- Webhook 5xx → Woovi reenvia automaticamente (até 5 tentativas).
- Duplicidade → `correlation_id` UNIQUE garante idempotência.

### 2.4 Saque (Withdraw)
```
[Barber UI] digita valor + PIN 4 dígitos
   → valida PIN (financeiro_auth_sessions, 15 min)
   → invoke('woovi-withdraw', { value_centavos })
       → wooviFetch POST /api/v1/subaccount/{pixKey}/withdraw
       → INSERT saques (status=processando, metodo=pix_woovi)
   → toast "Saque solicitado"
```
**Erros:**
- `PIN_REQUIRED` → forçar reabertura do gate de PIN.
- `NO_SUBACCOUNT` → redirecionar para cadastro de chave Pix.
- `WOOVI_ERROR` saldo insuficiente → mensagem clara ao usuário.

---

## 3. Variáveis & Secrets

| Nome | Onde | Uso |
|---|---|---|
| `WOOVI_APP_ID` | Runtime secret (Supabase) | Header Authorization de TODAS as chamadas |
| `SUPABASE_SERVICE_ROLE_KEY` | Runtime (managed) | Edge functions com privilégio elevado |

> **Atenção:** `WOOVI_APP_ID` nunca deve ir ao frontend.

---

## 4. Migração Asaas → Woovi (rollback / cleanup)

Edge functions Asaas marcadas como **deprecated**, podem ser deletadas após validação:
- `create-asaas-subaccount`
- `delete-asaas-subaccount`
- `get-asaas-financial-data`
- `get-barber-asaas-data`
- `authorize-transfer-webhook`
- `process-withdrawal` (apenas a parte Asaas)

Coluna `barbeiros.asaas_account_id` mantida temporariamente para histórico — remover em migração futura após 30 dias.

Script SQL manual de cleanup em `docs/woovi-migration-sql.sql`.

---

## 5. Diagrama (UML — sequência do pagamento)

```text
Cliente        Frontend           Edge (create-charge)        Woovi API           Webhook       DB
  |  agendar     |                       |                       |                  |             |
  |------------->|                       |                       |                  |             |
  |              |--invoke create-charge>|                       |                  |             |
  |              |                       |--POST /charge-------->|                  |             |
  |              |                       |<------brCode/QR-------|                  |             |
  |              |                       |--UPSERT woovi_charges-------------------------------->|
  |              |<-----QR Code----------|                       |                  |             |
  |  paga Pix    |                       |                       |                  |             |
  |--------------------------------------------------------------|                  |             |
  |              |                       |                       |---POST webhook-->|             |
  |              |                       |                       |                  |--UPDATE----->|
  |              |  Realtime: status=ok  |                       |                  |             |
  |              |<-----------------------------------------------------------------|             |
```

---

## 6. Checklist pós-deploy

- [ ] Secret `WOOVI_APP_ID` configurado
- [ ] Migration aplicada (`woovi_pix_key`, `woovi_charges`)
- [ ] 5 edge functions deployadas
- [ ] Webhook configurado no painel Woovi
- [ ] Pelo menos 1 barbeiro de teste com `woovi_pix_key`
- [ ] Teste end-to-end: agendar → pagar → conferir saldo → sacar

---

## 7. Status da Migração (estado atual)

### ✅ Concluído nesta iteração
- Migration: coluna `barbeiros.woovi_pix_key` + tabela `woovi_charges` (RLS)
- Secret `WOOVI_APP_ID` configurada
- 5 edge functions Woovi + cliente compartilhado (`_shared/woovi-client.ts`)
- `woovi-webhook` declarado em `supabase/config.toml` com `verify_jwt=false`
- `useWalletStatus`: aceita Woovi OU Asaas como carteira ativa (coexistência)
- `ClienteAgendar`: `barberHasBank` aceita Woovi OU Asaas
- Componente `WooviPixSheet` pronto (QR Code + polling Realtime)
- Documentação técnica em 5 camadas

### ⏭️ Pendente (follow-up — não bloqueia o fluxo principal)
- Wire `WooviPixSheet` no checkout do `ClienteAgendar` (passo de pagamento Pix)
- Refator `WalletOnboardingGate` → fluxo simplificado pedindo apenas chave Pix
- Refator `useFinancialExtrato` → ler `woovi_charges` + `wallet_transactions` em vez de Asaas
- Refator `FinancialSaque` → trocar `efi-send-pix` por `woovi-withdraw` (se desejado — hoje o saque PIX é via Efí, não Asaas)
- Remoção das edge functions Asaas (`create-asaas-subaccount` etc) após validação em produção
- Drop da coluna `barbeiros.asaas_account_id` (script em `docs/woovi-migration-sql.sql`)

### 🧪 Como testar o fluxo Woovi agora
1. Cadastre um barbeiro de teste e atribua manualmente uma `pixKey` válida:
   ```sql
   UPDATE barbeiros SET woovi_pix_key = '+5511999999999' WHERE id = '...';
   ```
2. Chame a edge function pelo painel Supabase:
   ```bash
   curl -X POST <FUNCTIONS_URL>/woovi-create-subaccount \
     -H "Authorization: Bearer <JWT>" \
     -d '{"barbeiro_id":"...","pix_key":"+5511999999999"}'
   ```
3. Gere uma cobrança de teste vinculada a um agendamento existente:
   ```bash
   curl -X POST <FUNCTIONS_URL>/woovi-create-charge \
     -H "Authorization: Bearer <JWT>" \
     -d '{"agendamento_id":"..."}'
   ```
4. Configure o webhook no painel Woovi apontando para `/functions/v1/woovi-webhook`.
5. Pague o Pix e observe o status do agendamento mudar para `confirmado` em tempo real.
