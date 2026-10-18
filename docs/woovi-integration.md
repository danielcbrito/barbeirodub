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

## Verificação e limites
8 testes unitários passaram. Preview abriu em /login sem pageerror; a página autenticada /admin/financeiro NÃO foi verificada, pois a sessão externa não é disponibilizada ao teste automatizado. Último sinal de compilação: build OK.
Consulta às funções públicas não encontrou referência Asaas. Única referência operacional restante no frontend é alias de coluna de taxas históricas; não realiza chamada bancária.
Exclusão hospedada confirmou três funções removidas: get-barber-asaas-data, get-asaas-financial-data, authorize-transfer-webhook. Tentativas para create-asaas-subaccount e delete-asaas-subaccount retornaram falha; ausência hospedada não foi comprovada.
Tentativa de remover ASAAS_API_KEY, ASAAS_SANDBOX_API_KEY e ASAAS_WEBHOOK_SECRET retornou not found no gerenciador. A lista externa informava esses nomes: remoção efetiva no projeto externo NÃO está comprovada.
Migrações reportaram 99 achados de segurança anteriores, sem novos na correção mais recente. Não foram corrigidos fora do escopo.
Pagamento real, saques reais, reembolso bancário, eventos externos e paridade de cartão não foram verificados. Não declarar conclusão 100%.
