# 🎯 PROMPT PARA O APLICATIVO DO CLIENTE (LOVABLE)
## Implementação: Formas de Pagamento Dinâmicas, Taxa de Cancelamento e Bloqueio Automático

> **Contexto:** Cole este prompt integralmente no projeto Lovable do **Aplicativo do Cliente** (`dubagenda.lovable.app`). O Painel do Barbeiro/Admin já gerencia e grava no banco Supabase (`djtpzvujzmrrslirzwun`) todas as configurações de formas de pagamento (Pix e Pagamento na Barbearia) e as regras de cobrança por cancelamento de cada profissional.

---

### 1. Formas de Pagamento no Checkout de Agendamento (Respeitar Escolha do Barbeiro)

Na tela de confirmação/pagamento do agendamento (onde aparecem os cards de **PIX** e **Pagar na Barbearia**):

1. **Consulta da Configuração do Barbeiro Selecionado:**
   Ao selecionar o barbeiro ou ao abrir a etapa de pagamento, consulte a configuração individual do barbeiro:
   ```typescript
   const { data } = await supabase
     .from("informacoes_empresa")
     .select("valor")
     .eq("chave", `formas_pagamento_${selectedBarberId}`)
     .maybeSingle();

   let pixHabilitado = true;
   let barbeariaHabilitado = true;

   if (data?.valor) {
     try {
       const parsed = JSON.parse(data.valor);
       if (typeof parsed.pix === "boolean") pixHabilitado = parsed.pix;
       if (typeof parsed.barbearia === "boolean") barbeariaHabilitado = parsed.barbearia;
     } catch (e) {}
   }
   ```

2. **Renderização Condicional:**
   - **Exibir o card "PIX"** apenas se `pixHabilitado === true`.
   - **Exibir o card "Pagar na Barbearia"** apenas se `barbeariaHabilitado === true`.
   - Se a forma atualmente selecionada for desativada, migre automaticamente a seleção para a forma restante disponível.

3. **Tempo Real (Realtime):**
   Adicione um listener Supabase Realtime na tabela `informacoes_empresa` com filtro `chave=eq.formas_pagamento_${selectedBarberId}` para que, caso o barbeiro altere a opção enquanto o cliente está na tela, a interface atualize imediatamente.

---

### 2. Cobrança de Taxa por Cancelamento de Agendamento

Quando o cliente solicitar o cancelamento de um agendamento:

1. **Buscar Regras de Cancelamento do Barbeiro:**
   ```typescript
   const { data: taxaData } = await supabase
     .from("informacoes_empresa")
     .select("valor")
     .eq("chave", `taxa_cancelamento_${barbeiroId}`)
     .maybeSingle();

   let taxaConfig = { habilitado: false, tipo: "porcentagem", valor: 20, horas_antecedencia: 0 };
   if (taxaData?.valor) {
     try {
       taxaConfig = JSON.parse(taxaData.valor);
     } catch (e) {}
   }
   ```

2. **Calcular se a Taxa se Aplica:**
   - Se `taxaConfig.habilitado === true`:
     - Verifique a antecedência: calcule a diferença em horas entre o horário atual e a data/hora do agendamento.
     - Se `taxaConfig.horas_antecedencia === 0` OU a antecedência for menor que `taxaConfig.horas_antecedencia`:
       - **Cálculo da Taxa:**
         - Se `tipo === 'porcentagem'`: `valorTaxa = Math.round((valorServico * (taxaConfig.valor / 100)) * 100) / 100;`
         - Se `tipo === 'fixo'`: `valorTaxa = taxaConfig.valor;`

3. **Registrar o Débito e Bloqueio no Banco:**
   Ao confirmar o cancelamento, crie o registro de débito incluindo os dados do cliente:
   ```typescript
   const novoDebito = {
     id: crypto.randomUUID(),
     cliente_id: clienteId,
     cliente_nome: clienteNome || user.user_metadata?.nome || user.email || "Cliente",
     cliente_telefone: clienteTelefone || user.user_metadata?.telefone || null,
     barbeiro_id: barbeiroId,
     agendamento_id: agendamentoId,
     valor_taxa: valorTaxa,
     tipo_taxa: taxaConfig.tipo,
     porcentagem_aplicada: taxaConfig.tipo === 'porcentagem' ? taxaConfig.valor : null,
     valor_servico_original: valorServico,
     motivo: `Taxa de cancelamento (${taxaConfig.tipo === 'porcentagem' ? `${taxaConfig.valor}%` : `R$ ${taxaConfig.valor.toFixed(2)}`})`,
     status: "pendente",
     created_at: new Date().toISOString()
   };

   // Salva na tabela e no fallback de informacoes_empresa
   await supabase.from("cliente_debitos_cancelamento").insert(novoDebito);
   await supabase.from("informacoes_empresa").upsert({
     chave: `debito_cancelamento_${clienteId}`,
     categoria: "debitos_cliente",
     valor: JSON.stringify(novoDebito),
     ativo: true
   }, { onConflict: "chave" });

   // Indexa na lista de débitos pendentes do barbeiro
   try {
     const listKey = `lista_debitos_pendentes_${barbeiroId}`;
     const { data: listRow } = await supabase.from("informacoes_empresa").select("id, valor").eq("chave", listKey).maybeSingle();
     let currentList = [];
     if (listRow?.valor) {
       try { currentList = JSON.parse(listRow.valor); } catch {}
     }
     currentList = [novoDebito, ...currentList.filter(d => d.id !== novoDebito.id && d.cliente_id !== novoDebito.cliente_id)];
     await supabase.from("informacoes_empresa").upsert({
       chave: listKey,
       categoria: "debitos_barbeiro",
       valor: JSON.stringify(currentList),
       ativo: true
     }, { onConflict: "chave" });
   } catch {}
   ```

---

### 3. Travamento Automático do Aplicativo do Cliente

No componente raiz do app (App Shell / Layout principal do Cliente):

1. **Verificação de Débito Pendente:**
   Sempre que o cliente logado abrir o aplicativo, execute:
   ```typescript
   const { data: debitoInfo } = await supabase
     .from("informacoes_empresa")
     .select("valor")
     .eq("chave", `debito_cancelamento_${user.id}`)
     .maybeSingle();

   let debitoPendente = null;
   if (debitoInfo?.valor) {
     const parsed = JSON.parse(debitoInfo.valor);
     if (parsed.status === "pendente") {
       debitoPendente = parsed;
     }
   }
   ```

2. **Bloqueio Total:**
   - Se `debitoPendente !== null`:
     - O aplicativo **fica completamente travado** com uma tela/modal de bloqueio fixa (overlay sobreposto com `z-[9999]`, fundo escuro e sem botão de fechar).
     - O cliente **não consegue agendar, nem navegar, nem solicitar serviços**.
     - A tela de bloqueio deve exibir:
       - Título: **"Aplicativo Temporariamente Bloqueado"**
       - Mensagem: *"Você possui uma taxa de cancelamento pendente referente ao agendamento cancelado."*
       - Valor em destaque: `R$ ${debitoPendente.valor_taxa.toFixed(2).replace('.', ',')}`
       - Botão **"Pagar taxa via Pix para desbloquear"**.
       - Ao clicar, exibe o QR Code Pix e o botão "Copiar código Pix Copia e Cola".

3. **Desbloqueio em Tempo Real (Pagamento Pix OU Liberação Manual pelo Barbeiro):**
   - Adicione listener Realtime em `informacoes_empresa` com filtro `chave=eq.debito_cancelamento_${user.id}`:
   ```typescript
   const channel = supabase
     .channel(`debito-${user.id}`)
     .on("postgres_changes", {
       event: "*",
       schema: "public",
       table: "informacoes_empresa",
       filter: `chave=eq.debito_cancelamento_${user.id}`
     }, (payload) => {
       if (payload.eventType === "DELETE") {
         desbloquearApp();
         return;
       }
       if (payload.new?.valor) {
         try {
           const parsed = JSON.parse(payload.new.valor);
           // Se status for 'pago', 'dispensado' ou 'liberado_manual', desbloqueia imediatamente!
           if (parsed.status === "pago" || parsed.status === "dispensado" || parsed.status === "liberado_manual") {
             desbloquearApp();
             return;
           }
         } catch {}
       }
     })
     .subscribe();
   ```
   - O aplicativo é liberado instantaneamente na tela do cliente sem necessidade de recarregar a página!
