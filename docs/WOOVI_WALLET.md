# Carteira Woovi — Arquitetura e Operação

Documento técnico/operacional da Carteira Woovi de barbeiros.

## Camadas

### 1. Usuário (Barbeiro)
- Acessa **Perfil → Carteira**.
- Se ainda não tem subconta: preenche **Nome**, **Tipo de chave Pix** e **Chave Pix** dentro do próprio modal e cria a subconta.
- Se já tem: vê **Saldo**, **Histórico** e **Configurações**.

### 2. Frontend (`src/components/barber/WooviWalletSheet.tsx`)
- Componente único, controlado por `open` / `onOpenChange`.
- Aba **Saldo**: saldo em tempo real + saque manual (protegido por PIN financeiro).
- Aba **Histórico**: últimos 50 lançamentos (depósitos via cobrança + saques).
- Aba **Configurações**: liga/desliga saque automático e define valor mínimo.
- Túlio Santos é identificado pelo nome e é considerado **conta principal** — pula o passo de criar subconta.

### 3. Backend (Supabase Edge Functions)
| Função | Verbo | Propósito |
|---|---|---|
| `woovi-create-subaccount` | POST | Cria a subconta na Woovi vinculada à chave Pix do barbeiro. |
| `woovi-get-balance` | GET | Consulta saldo atual da subconta. |
| `woovi-withdraw` | POST | Saque manual (requer sessão de PIN financeiro < 15 min). |
| `woovi-update-settings` | POST | Atualiza flags de saque automático. |
| `woovi-history` | GET | Histórico unificado (cobranças pagas + saques). |
| `woovi-create-charge` | POST | Gera cobrança Pix da agenda na subconta do barbeiro. |
| `woovi-webhook` | POST | Recebe eventos de pagamento da Woovi. |
| `woovi-auto-withdraw-cron` | POST | Agendada diariamente; saca saldo de barbeiros com auto-saque ativo. |

### 4. Banco (Supabase / `public.barbeiros`)
Colunas relevantes:
- `woovi_pix_key` — chave Pix vinculada à subconta (NULL = sem subconta).
- `woovi_subaccount_name` — nome cadastrado na Woovi.
- `woovi_pix_key_type` — `cpf | cnpj | email | phone | random`.
- `woovi_auto_withdraw_enabled` — boolean.
- `woovi_auto_withdraw_min_centavos` — limiar para saque automático (default R$ 50,00).
- `woovi_last_auto_withdraw_at` — timestamp do último saque automático.

Tabelas usadas:
- `woovi_charges` — cobranças geradas (entrada).
- `saques` — registros de saque (saída), `metodo = 'pix_woovi'`.
- `financeiro_auth_sessions` — sessão de PIN para liberar saque manual.

### 5. Serviços Externos
- **Woovi (api.woovi.com)** — autenticação via header `Authorization: <WOOVI_APP_ID>`.
  - `POST /api/v1/subaccount` — cria subconta (idempotente por `pixKey`).
  - `GET /api/v1/subaccount/{pixKey}` — saldo.
  - `POST /api/v1/subaccount/{pixKey}/withdraw` — saque devolve saldo para a própria chave.
  - `POST /api/v1/charge` — cobrança em nome da subconta.
- **Limitações relevantes**: saque só vai para a própria chave; não há Pix avulso para terceiros, nem transferência entre subcontas, nem boleto/TED.

## Fluxos críticos

### Fluxo: Criar subconta
1. Barbeiro abre Carteira → preenche nome + tipo + chave.
2. Frontend chama `woovi-create-subaccount`.
3. Edge function valida token, chama Woovi e persiste em `barbeiros.woovi_pix_key`, `woovi_subaccount_name`, `woovi_pix_key_type`.
4. UI recarrega saldo automaticamente.

**Erros tratados**: token ausente/expirado → 401; chave duplicada → API Woovi retorna a existente (idempotente); chave inválida → mensagem do Woovi propagada.

### Fluxo: Saque manual
1. Barbeiro digita valor.
2. Verifica PIN financeiro (sessão < 15 min). Sem sessão → frontend redireciona para PIN.
3. `woovi-withdraw` valida sessão no banco e chama Woovi.
4. Insere registro em `saques` com `status = processando`.
5. Webhook futuro do Woovi atualiza `status` (não coberto aqui).

**Erros**: `PIN_REQUIRED` (403), `NO_SUBACCOUNT` (sem chave configurada), `INVALID_VALUE` (≤0), `WOOVI_ERROR` (falha upstream).

### Fluxo: Saque automático (cron)
1. `pg_cron` chama `woovi-auto-withdraw-cron` diariamente (ex.: 08:00 BRT).
2. Função varre barbeiros com `woovi_auto_withdraw_enabled = true`.
3. Para cada um: consulta saldo; se ≥ `woovi_auto_withdraw_min_centavos`, dispara `withdraw` do saldo total.
4. Insere em `saques` e atualiza `woovi_last_auto_withdraw_at`.

**Erros**: cada barbeiro é tratado isoladamente; falhas são acumuladas em `results` sem interromper o lote.

## Configuração do cron (pg_cron)

Executar uma vez via SQL Editor:

```sql
select cron.schedule(
  'woovi-auto-withdraw-daily',
  '0 11 * * *', -- 08:00 BRT (11:00 UTC)
  $$
  select net.http_post(
    url := 'https://djtpzvujzmrrslirzwun.supabase.co/functions/v1/woovi-auto-withdraw-cron',
    headers := '{"Content-Type":"application/json","apikey":"<ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

## Onboarding manual do Túlio Santos (conta principal)

Túlio usa a **conta principal Woovi** (a do `WOOVI_APP_ID`), não uma subconta. Para garantir que o app trate corretamente:

1. Crie/garanta o profile do Túlio com `nome = 'Túlio Santos'` (o frontend identifica por esse nome).
2. Garanta que existe um registro em `public.barbeiros` com `user_id` apontando para esse profile.
3. **Não** chame `woovi-create-subaccount` para ele — o componente já pula esse passo.
4. (Opcional) Para que a tela de saldo mostre algo coerente desde o início, marque a coluna `woovi_pix_key` com a chave Pix da **conta principal** cadastrada no painel Woovi. Use o SQL Editor:

   ```sql
   update public.barbeiros
   set woovi_pix_key = '<CHAVE_PIX_DA_CONTA_PRINCIPAL>',
       woovi_subaccount_name = 'Túlio Santos',
       woovi_pix_key_type = 'cpf' -- ou email/phone/cnpj/random
   where user_id = (
     select id from public.profiles where nome = 'Túlio Santos' limit 1
   );
   ```

5. O endpoint `woovi-get-balance` continuará retornando o saldo dessa chave; como ela é a chave da conta principal, mostra o saldo global da conta Woovi.

## Segurança
- Todas as funções (exceto webhook e cron) exigem JWT do usuário.
- Saque manual exige PIN financeiro recente.
- Saque automático só dispara se o barbeiro tiver ativado explicitamente.
- Service role é usado apenas dentro das edge functions.
