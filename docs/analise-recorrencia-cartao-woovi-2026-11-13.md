# Análise do documento de recorrência com cartão Woovi — 13/11/2026

## Conclusão
O arquivo enviado propõe salvar card_id e customer_id após o primeiro pagamento e reutilizar card_id em POST /api/v1/charge. A documentação oficial pública consultada não comprova esse fluxo. Ela documenta cobranças avulsas com type=CREDIT_CARD, nome e CPF/CNPJ do pagador, sem informar card_id/customer_id na resposta nem um campo de token na criação da cobrança.

Por segurança financeira, nenhuma migration, cobrança automática, rotina agendada ou alteração do checkout foi implementada com base nessa suposição.

## Evidências verificadas
- Documentação de criação de cobrança com cartão: https://developers.woovi.com/docs/card/card-how-to-create-charge-using-api
- Visão geral de cartão e 3DS: https://developers.woovi.com/docs/card/card-first-steps
- Categoria oficial de cartão, com apenas cobrança, parcelamento, preferência e liquidação: https://developers.woovi.com/docs/category/cart%C3%A3o-de-cr%C3%A9dito
- Banco atual: zero respostas Woovi contendo card_id/cardId ou customer_id/customerId e zero cobranças de plano com cartão. Isso não prova ausência do recurso, mas também não oferece evidência para sustentar a implementação.

## Problemas técnicos do roteiro enviado
1. Falta o contrato oficial da resposta que conteria card_id e customer_id.
2. Falta o contrato oficial da requisição que aceitaria card_id para uma cobrança sem nova autenticação do pagador.
3. Uma cobrança off-session exige consentimento explícito e suporte do provedor; repetir uma cobrança avulsa não transforma o pagamento em recorrência legítima.
4. 3DS pode exigir autenticação do pagador. Não é seguro presumir que toda renovação será aprovada sem interação.
5. O segredo configurado no projeto é WOOVI_APP_ID, não WOOVI_API_KEY.
6. SERVICE_ROLE não deve ser embutido em SQL de agendamento. Qualquer futura rotina deve usar o padrão interno protegido e a chave pública do projeto, sem expor credenciais.
7. Os nomes propostos data_renovacao e pagamento_pendente não correspondem ao modelo atual, que usa next_billing_date e os estados já definidos em tenant_assinaturas.
8. A regra atual de vencimento mensal usa intervalo de um mês; não deve ser substituída por 30 dias fixos sem definição de negócio.

## Requisitos para liberar uma implementação futura
- Link oficial Woovi descrevendo tokenização e cobrança de cartão off-session.
- Exemplo oficial de resposta com os identificadores e exemplo oficial do payload de renovação.
- Confirmação do consentimento apresentado ao pagador e do fluxo de cancelamento do mandato.
- Regras oficiais para 3DS, recusa, retentativa e idempotência.
- Um teste controlado com pagador autorizado, sem registrar número, CVV ou dados brutos do cartão.

Somente depois dessas evidências faz sentido criar colunas tokenizadas, a função de renovação diária e o texto prometendo débito automático. O Pix Automático existente não foi alterado.
