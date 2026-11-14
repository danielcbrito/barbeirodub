# Pagamentos Woovi — estado verificado em 18/10/2026

Woovi é o banco autorizado. O antigo diagnóstico que descreveu Asaas como banco atual estava incorreto.

## Usuário
Pix online usa Woovi. Dinheiro presencial, planos e fidelidade existentes foram preservados. Cartão online não tem substituto comprovado na integração e foi retirado das opções de compra migradas.

## Frontend
ClienteAgendar e ClienteAssinar recebem respostas Woovi. RenovacaoSheet exibe Pix; reserva desaparecida não significa pagamento confirmado. Cadastro e exclusão de barbeiros não chamam subcontas do banco antigo. Extrato lê registros locais e cobranças Woovi.

## Backend / N8N
create-payment, create-subscription, renew-subscription e generate-subscription-charges usam o helper compartilhado woovi-charge. store-api conserva ações da carteira e cria Pix da loja via Woovi. process-withdrawal antigo falha fechado com 410. N8N externo não foi acessado: workflows externos não estão auditados.

## Banco Supabase
woovi_charges relaciona reserva, agendamento, assinatura ou pedido. confirm_woovi_payment exige o valor exato e executa confirmação em transação, com bloqueio e tratamento de repetição. Execução negada a anon e authenticated, permitida ao serviço de pagamentos. Histórico, colunas antigas e migrations antigas são preservados para não destruir registros financeiros.

## Serviços externos
WOOVI_APP_ID permanece apenas no serviço. Webhook valida assinatura e reconsulta a Woovi antes de confirmar. Configuração de eventos no painel Woovi não foi verificada. Integrações Efí preexistentes foram preservadas; não são Asaas.

## Fluxos críticos
Auth: sessão -> token atual -> função -> validação do usuário -> verificação de propriedade.
Agendamento: serviços e preços oficiais -> reserva -> intenção local -> cobrança Woovi -> QR -> pagamento -> webhook assinado -> revalidação bancária -> confirmação transacional -> leitura de status COMPLETED.
Planos: assinatura não paga -> Pix -> confirmação -> ativação/reset dos usos do ciclo. Renovação pendente pode ser retomada sem criar uma assinatura nova.
Loja: preços oficiais -> reserva de estoque -> Pix -> confirmação -> finalização do pedido.

```text
Cliente -> Frontend -> Função autenticada -> Intenção no Supabase
                                       -> API Woovi -> QR Pix
Woovi -> Webhook assinado -> Consulta API Woovi -> RPC transacional
                                                     -> Status no Frontend
```

## Erros e caminhos de recuperação
- Preço adulterado: rejeitado antes da cobrança; créditos parciais estão bloqueados até implementação de consumo atômico na confirmação. Isso é uma limitação real, não migração concluída.
- Reserva expirada após pagamento: RECONCILIATION_REQUIRED; não alegar agendamento confirmado nem estorno realizado.
- Falha ao salvar cobrança já criada: conservar intenção e solicitar reconciliação; não apagar o registro.
- Renovação com falha: manter pending_renewal e permitir retomada Pix com mesma correlação.
- Valor bancário divergente: rejeitar confirmação.
- Banco sem saldo válido: retornar erro, não saldo zero inventado.

## Assinatura da barbearia — atualização em 13/11/2026

### Usuário e Frontend
Barbeiro e administrador usam a mesma tela de planos. Após escolher o plano, o checkout mostra Pix Automático e cartão. O Pix só é criado quando o usuário confirma; o QR Code e o código copiável vêm da Woovi. Foram removidos os links Cakto, o Pix estático com chave fixa e a confirmação manual que gravava pagamento diretamente no navegador.

Pix Automático e cartão estão disponíveis. O Pix é criado somente após confirmação do usuário; QR Code e código copiável vêm da Woovi. O cartão abre a página segura oficial e ativa o plano somente após a cobrança ficar COMPLETED. Foram removidos os links Cakto, o Pix estático com chave fixa e a ativação manual no navegador.

O cartão é pagamento mensal, não recorrência automática: a API documentada pela Woovi oferece cobrança avulsa com CREDIT_CARD. Sua liquidação ocorre na conta de recebimento externa cadastrada na Woovi, não em uma subconta Woovi. Para cobrança automática todo mês, o checkout orienta o uso do Pix Automático.

### Backend Woovi
create-tenant-plan-subscription valida sessão, propriedade do tenant, plano e preço oficiais, identidade, contato e CEP. A intenção é registrada antes da chamada bancária. O Pix recorrente usa PAYMENT_ON_APPROVAL e frequência mensal, sem splits: o valor das novas assinaturas fica na conta principal Woovi. A política routeTenantPlanToMainAccount remove qualquer split legado e possui teste de regressão. O cartão usa POST /api/v1/charge com CREDIT_CARD e paymentLinkUrl. Ambos exigem correlação e valor exatos na consulta de status.

woovi-webhook trata PIX_AUTOMATIC_APPROVED, PIX_AUTOMATIC_COBR_COMPLETED e cobranças mensais concluídas. Sempre revalida na API antes da confirmação. Renovação Pix exige parcela COMPLETED; consulta de status nunca altera vencimento.

### Banco Supabase e Túlio
confirm_tenant_plan_payment valida a intenção, tenant, plano ativo, método e valor em centavos, bloqueia os registros e ativa ou renova em transação. Cobranças antigas não substituem assinaturas mais recentes. Execução permanece exclusiva de service_role.

A subconta do Túlio estava vinculada no cadastro e recebeu o nome de exibição Tulio. Nenhum valor foi creditado, debitado ou sacado nesta alteração: o saldo bancário atual não estava disponível para uma reconciliação segura. A verificação de liquidez da conta principal no saque agora é independente do saldo da subconta, evitando enviar uma tentativa quando o caixa principal não cobre o valor.

### Verificação e limites desta etapa
13 testes focados passaram, cobrindo destino central sem split, cartão concluído, correlação, valor, autorização e parcela. A compilação terminou com build OK. Nenhuma cobrança real foi criada e nenhum saque foi executado. O fluxo logado não pôde ser exercitado porque o Supabase externo não fornece sessão ao navegador de teste. O cartão precisa estar habilitado e com KYC ativo na Woovi; seus recebimentos seguem a conta externa cadastrada no banco. As migrations reportaram 119 achados de segurança preexistentes, sem interromper esta tarefa.

## Checkout, recorrência e segurança — atualização em 13/11/2026 às 19:20 UTC

### Requisitos bancários
A tela e a função agora exigem nome, CPF ou CNPJ matematicamente válido, e-mail, telefone e endereço completo (rua, número, bairro, cidade, UF e CEP). A tela apresenta esses requisitos antes dos métodos de pagamento e mostra a lista retornada pelo serviço quando algo falta. Foram removidos os valores fictícios de rua, número, bairro, cidade e UF.

O Pix Automático usa a jornada PAYMENT_ON_APPROVAL, tipo PIX_RECURRING e frequência MONTHLY. O primeiro pagamento e a autorização acontecem no QR Code; as renovações exigem parcela concluída. A API oficial de cartão documenta CREDIT_CARD como cobrança avulsa e não oferece mandato recorrente/tokenização para débito mensal automático. Portanto, o cartão continua sem recorrência simulada e sem armazenamento de cartão no DUB. Referências: https://developers.woovi.com/docs/pix-automatic/pix-automatic-how-to-create e https://developers.woovi.com/docs/card/card-how-to-create-charge-using-api.

### Segurança
A primeira varredura encontrou 5 erros e 8 avisos. Foram corrigidos: RLS ausente em n8n_chat_histories, leitura irrestrita de agente_webhook_global, gestão irrestrita de discount_coupons, escrita/exclusão irrestritas no bucket avatars e search_path mutável em quatro funções. A segunda varredura encontrou zero erros; restaram três avisos de leitura pública em dados operacionais (configuracoes_horario, plano_servicos e tenant_plano_faixas) e 20 informações preexistentes. Não se revogou em massa o acesso a outras funções porque isso exige revisão de cada fluxo para não interromper agenda e relatórios.

### Verificação
19 testes focados passaram, incluindo CPF/CNPJ, endereço completo, contato, payload mensal Pix, ausência de splits, cartão sem falsa recorrência e recuperação de sessão. A verificação TypeScript passou. A função create-tenant-plan-subscription foi implantada. Não houve autorização Pix ou pagamento real: o Supabase externo não disponibiliza sessão ao navegador de teste, a autorização depende do aplicativo bancário do pagador e o cartão depende de habilitação/KYC da Woovi.

## Verificação e limites
8 testes unitários passaram. Preview abriu em /login sem pageerror; a página autenticada /admin/financeiro NÃO foi verificada, pois a sessão externa não é disponibilizada ao teste automatizado. Último sinal de compilação: build OK.
Consulta às funções públicas não encontrou referência Asaas. Única referência operacional restante no frontend é alias de coluna de taxas históricas; não realiza chamada bancária.
Exclusão hospedada confirmou três funções removidas: get-barber-asaas-data, get-asaas-financial-data, authorize-transfer-webhook. Tentativas para create-asaas-subaccount e delete-asaas-subaccount retornaram falha; ausência hospedada não foi comprovada.
Tentativa de remover ASAAS_API_KEY, ASAAS_SANDBOX_API_KEY e ASAAS_WEBHOOK_SECRET retornou not found no gerenciador. A lista externa informava esses nomes: remoção efetiva no projeto externo NÃO está comprovada.
Migrações reportaram 99 achados de segurança anteriores, sem novos na correção mais recente. Não foram corrigidos fora do escopo.
Pagamento real, saques reais, reembolso bancário, eventos externos e paridade de cartão não foram verificados. Não declarar conclusão 100%.
