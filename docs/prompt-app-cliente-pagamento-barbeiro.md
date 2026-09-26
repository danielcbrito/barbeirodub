# 🎯 PROMPT — Implementação de Pagamento Condicional no App do Cliente

> **Contexto:** Este prompt deve ser colado no projeto Lovable do **App do Cliente** (projeto separado). O Painel Admin/Barbeiro (este projeto) já possui toda a infraestrutura Woovi (subcontas, chaves Pix, saldos, saques). O App do Cliente precisa apenas **consultar** o estado da subconta do barbeiro e gerar a cobrança no gateway certo.

---

## 1. Objetivo da feature

No fluxo de checkout do agendamento (após o cliente escolher **barbeiro → serviço → data → horário**), o sistema deve:

1. **Identificar automaticamente** se o barbeiro selecionado já criou a subconta Woovi.
2. **Renderizar os métodos de pagamento condicionalmente**:
   - ❌ **Sem subconta** → apenas **"Pagar na barbearia"** (dinheiro/maquininha local).
   - ✅ **Com subconta** → **"Pix"**, **"Cartão"** e **"Pagar na barbearia"**.
3. **Reter o valor** no gateway até o **barbeiro marcar o agendamento como concluído**.
4. Ao **concluir**, liberar o valor para o saldo disponível da subconta do barbeiro.
5. Permitir **reembolso/cancelamento** enquanto o agendamento NÃO estiver concluído.

---

## 2. Banco de dados compartilhado (Supabase — mesmo projeto)

> Os dois apps (Admin e Cliente) consomem o **mesmo Supabase**. Use as mesmas credenciais (`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`).

### 2.1 Tabela `barbeiros` — colunas relevantes

| Coluna | Tipo | Uso |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK auth.users |
| `nome` | text | Nome exibido |
| `woovi_subaccount_name` | text \| null | Nome cadastrado na subconta |
| `woovi_pix_key` | text \| null | **Chave Pix da subconta — usar como flag de "tem subconta"** |
| `woovi_pix_key_type` | text \| null | cpf / cnpj / email / phone / random |
| `woovi_auto_withdraw_enabled` | bool | Saque automático |

**Regra de detecção da subconta:**
```ts
const hasSubaccount = Boolean(barbeiro.woovi_pix_key && barbeiro.woovi_subaccount_name);
```

### 2.2 Tabela `agendamentos` — colunas relevantes

| Coluna | Tipo | Uso |
|---|---|---|
| `id` | uuid | PK |
| `barbeiro_id` | uuid | FK barbeiros |
| `cliente_id` | uuid | FK auth.users |
| `servico_id` | uuid | FK servicos |
| `data` / `hora` | date / time | Horário |
| `preco` | numeric | Valor cobrado |
| `status` | text | `agendado` → `concluido` / `cancelado` |
| `payment_method` | text | `pix` / `card` / `cash` |
| `payment_status` | text | `pending` / `held` / `released` / `refunded` |
| `payment_charge_id` | text | ID da cobrança Woovi |

### 2.3 Tabela `woovi_charges` (já existe) — espelho de cobranças

Use-a como log/auditoria. Schema mínimo:
`id, agendamento_id, barbeiro_id, customer_id, value_centavos, status, charge_id, created_at`.

---

## 3. Fluxo do Checkout (Frontend — App do Cliente)

### 3.1 Componente `<PaymentMethodSelector />`

```tsx
const { data: barbeiro } = await supabase
  .from("barbeiros")
  .select("id, nome, woovi_pix_key, woovi_subaccount_name")
  .eq("id", barbeiroId)
  .maybeSingle();

const hasSubaccount = Boolean(barbeiro?.woovi_pix_key && barbeiro?.woovi_subaccount_name);

const methods = hasSubaccount
  ? [
      { id: "pix",  label: "Pix",                  icon: "qr-code" },
      { id: "card", label: "Cartão de crédito",    icon: "credit-card" },
      { id: "cash", label: "Pagar na barbearia",   icon: "store" },
    ]
  : [
      { id: "cash", label: "Pagar na barbearia",   icon: "store" },
    ];
```

**UX obrigatória:**
- Se `!hasSubaccount`, exibir um aviso discreto: *"Este profissional ainda não habilitou pagamento online. Você pagará diretamente na barbearia."*
- Não permitir o cliente escolher Pix/Cartão para barbeiros sem subconta — **isso é validado também no backend** (defesa em profundidade).

### 3.2 Submit do agendamento

1. Cria o registro em `agendamentos` com `status="agendado"` e `payment_status="pending"`.
2. Se `payment_method === "cash"` → fim do fluxo, mostra confirmação.
3. Se `payment_method ∈ {"pix","card"}` → chama a edge function `client-create-charge` (criar nesse projeto, ver §4).

---

## 4. Edge Function `client-create-charge` (App Cliente)

```ts
// supabase/functions/client-create-charge/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const { agendamento_id, method } = await req.json(); // method: 'pix' | 'card'

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 1) Buscar agendamento + barbeiro
  const { data: ag } = await admin
    .from("agendamentos")
    .select("id, preco, barbeiro_id, cliente_id, barbeiros(woovi_pix_key, woovi_subaccount_name)")
    .eq("id", agendamento_id)
    .single();

  // 2) Defesa: bloquear se barbeiro não tem subconta
  if (!ag.barbeiros?.woovi_pix_key) {
    return Response.json(
      { error: "Barbeiro não habilitou pagamento online" },
      { status: 400 }
    );
  }

  // 3) Criar cobrança no Woovi (mesma API usada no painel)
  const wooviRes = await fetch("https://api.openpix.com.br/api/v1/charge", {
    method: "POST",
    headers: {
      "Authorization": Deno.env.get("WOOVI_API_KEY")!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      correlationID: `ag_${agendamento_id}`,
      value: Math.round(ag.preco * 100),       // centavos
      comment: `Agendamento ${agendamento_id}`,
      // Split / subconta destino: usar a pix key do barbeiro
      subaccount: ag.barbeiros.woovi_pix_key,
      // Hold/escrow: a liberação acontece via webhook + RPC após "concluido"
    }),
  });

  const charge = await wooviRes.json();

  // 4) Persistir
  await admin.from("agendamentos").update({
    payment_method: method,
    payment_status: "held",
    payment_charge_id: charge.charge.identifier,
  }).eq("id", agendamento_id);

  await admin.from("woovi_charges").insert({
    agendamento_id,
    barbeiro_id: ag.barbeiro_id,
    customer_id: ag.cliente_id,
    value_centavos: Math.round(ag.preco * 100),
    status: "held",
    charge_id: charge.charge.identifier,
  });

  return Response.json({
    qrCode: charge.charge.qrCodeImage,
    pixCopyPaste: charge.charge.brCode,
    chargeId: charge.charge.identifier,
  });
});
```

**Secrets necessários (Lovable Cloud):**
- `WOOVI_API_KEY` — chave da conta principal Woovi (a mesma usada no painel admin).

---

## 5. Liberação do valor — quando o barbeiro conclui o corte

O **Painel Admin/Barbeiro** (este projeto) é quem dispara a liberação. **NÃO precisa ser implementado no App do Cliente.** Apenas documentar a integração:

### Fluxo no Admin
1. Barbeiro clica em **"Concluir agendamento"**.
2. Front chama edge function `complete-appointment` (no admin):
   ```ts
   await supabase.functions.invoke("complete-appointment", { body: { agendamento_id } });
   ```
3. A função:
   - Atualiza `agendamentos.status = 'concluido'`.
   - Atualiza `agendamentos.payment_status = 'released'`.
   - Credita o valor no saldo disponível da subconta (já fica automaticamente, pois a cobrança foi criada com `subaccount: woovi_pix_key`).
   - Insere registro em `wallet_transactions` (entrada `type='deposit'`, `status='completed'`).

### Cancelamento / Reembolso
- Enquanto `payment_status === 'held'`, o cliente OU o barbeiro podem cancelar.
- A função `cancel-appointment` chama o endpoint de refund da Woovi e atualiza `payment_status = 'refunded'`.
- Após `released`, reembolso só por suporte (manual).

---

## 6. Diagrama de Estados — `payment_status`

```
   ┌─────────┐  cliente paga (Pix/Card)  ┌──────┐
   │ pending │ ─────────────────────────▶│ held │
   └─────────┘                           └──┬───┘
        │ cliente paga em dinheiro          │
        ▼                                   │ barbeiro conclui
   ┌─────────┐                              ▼
   │  cash   │                        ┌──────────┐
   └─────────┘                        │ released │
                                      └──────────┘
                                            ▲
                                            │ ⚠️ irreversível
   held ──▶ refunded   (cancelamento antes da conclusão)
```

---

## 7. Checklist de implementação no App do Cliente

- [ ] Conectar ao mesmo Supabase (URL + anon key do Painel Admin).
- [ ] Criar componente `<PaymentMethodSelector barbeiroId={...} />` com a lógica do §3.1.
- [ ] Validar `hasSubaccount` antes de enviar para o gateway.
- [ ] Criar edge function `client-create-charge` (§4).
- [ ] Adicionar secret `WOOVI_API_KEY`.
- [ ] Tela de Pix (QR + copia-e-cola) com polling de status (`woovi_charges.status`).
- [ ] Tela de Cartão (tokenização Woovi).
- [ ] Tela de sucesso/falha + reembolso.
- [ ] Webhook `woovi-webhook` (já existe no Painel) atualizar `woovi_charges.status` — **reaproveitar**, não duplicar.

---

## 8. Pontos de atenção (Segurança & UX)

| ⚠️ | Regra |
|---|---|
| 🔒 | **Nunca** confiar no `payment_method` enviado pelo cliente sem revalidar `woovi_pix_key` no backend. |
| 🔒 | Service-role key **só** em edge functions. App usa anon. |
| 🎯 | Mostrar nome do barbeiro + valor + serviço na tela de pagamento (transparência). |
| 🎯 | Loading states em TODAS as etapas (criando cobrança, gerando QR, etc.). |
| 🎯 | Polling do status do Pix a cada 4s (mesmo padrão do Painel Admin — ver `mem://features/plan-renewal-polling-logic`). |
| 🎯 | Após "concluido", enviar push/notificação para o cliente: *"Pagamento liberado para o profissional"*. |

---

**Pronto. Cole este prompt no chat do projeto do App do Cliente e mande implementar.**
