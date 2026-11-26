# Subcontas removidas e Pix por conta própria — 26/11/2026

## Regra aplicada

- Túlio mantém a subconta existente e o acesso à carteira atual.
- Pedro Santos, José, Barbeiro VIP e qualquer outro barbeiro não reutilizam subconta antiga nem a conta do proprietário da barbearia.
- O Barbeiro Teste perdeu somente o vínculo Woovi antigo; sua conexão Mercado Pago foi preservada.
- O Pix do cliente fica disponível somente quando o barbeiro selecionado possui conta própria aprovada e credencial compatível com o provedor.
- Uma conta em rascunho, análise ou recusada não libera Pix, mesmo que exista uma credencial antiga.
- Nenhum histórico de cobrança, pagamento, agendamento ou extrato foi apagado.

## Camadas

### Usuário

- O barbeiro sem conta válida abre Finanças e escolhe entre conectar Mercado Pago ou criar conta Woovi própria.
- Enquanto a conta não estiver ativa, o cliente não vê Pix para esse barbeiro.
- Depois da aprovação e do registro da credencial, o Pix é liberado automaticamente.
- No Mercado Pago, a tela orienta que saldo, extrato e transferências são consultados no aplicativo do Mercado Pago.
- Funcionários da barbearia do Túlio precisam da própria conta; não herdam a conta dele.

### Frontend

- `OwnAccountGate`: bloqueia o acesso de quem não tem conta aprovada e inicia um rascunho quando o cadastro ainda não existe.
- `CarteiraPage`: contas próprias aprovadas não entram no formulário da subconta antiga.
- `ClienteAgendar`: combina a preferência de pagamento do barbeiro com a disponibilidade real de recebimento Pix.
- Avisos de configuração, banner de ativação e etapa de conclusão usam a mesma disponibilidade individual.

### Backend / funções

- `_shared/woovi-charge.ts`: escolhe Mercado Pago ou Woovi somente pela conta aprovada e pela credencial correspondente.
- O Mercado Pago usa o token OAuth do próprio barbeiro.
- A Woovi própria usa o AppID do próprio barbeiro, sem split de subconta.
- A exceção da conta principal é válida somente para o Túlio.
- `woovi-create-subaccount`: o endpoint legado recusa a criação para qualquer barbeiro que não seja o dono autenticado da conta principal.
- Se uma tela antiga ainda tentar gerar Pix sem conta elegível, o servidor recusa a cobrança.

### Banco Supabase

- A limpeza removeu os campos operacionais da subconta antiga de todos os barbeiros, exceto Túlio.
- `barber_pix_availability` expõe somente `barbeiro_id` e `can_receive_pix` para usuários autenticados.
- Tokens, AppIDs, documentos e dados bancários não são expostos ao cliente.
- Triggers atualizam a disponibilidade quando a conta, a credencial Woovi, a credencial Mercado Pago ou o estado do barbeiro muda.
- `validate_barber_can_receive_pix` é `SECURITY INVOKER` e consulta apenas essa projeção segura.
- Migrações aplicadas:
  - `20261126184748_7e196cfe-218b-4bd9-9c85-7353cba9aebb.sql`
  - `20261126184948_0f3f0484-842a-4a9e-a74e-6fa3668418bc.sql`

### Serviços externos

- Nenhuma subconta foi encerrada na Woovi.
- Nenhum saque, transferência ou reconciliação de valores foi executado.
- A exclusão definitiva das subcontas antigas no banco depende de conferir e retirar eventuais saldos antes.
- O modelo parceiro da Woovi continua dependendo da habilitação dos escopos de parceiro já registrados no roadmap.

## Estado conferido no banco

| Barbeiro | Subconta antiga | Conta atual | Pix |
| --- | --- | --- | --- |
| Barbeiro Teste | Removida | Mercado Pago aprovado | Disponível |
| Barbeiro VIP | Não vinculada | Woovi em rascunho | Indisponível |
| José | Removida | Woovi em rascunho | Indisponível |
| Pedro Santos | Removida | Woovi em rascunho | Indisponível |
| Túlio | Preservada | Exceção da conta principal | Disponível |

## Fluxo de erro

1. Cliente escolhe um barbeiro sem conta elegível: a opção Pix não é renderizada.
2. Uma seleção Pix anterior é trocada automaticamente para pagamento na barbearia quando essa opção existe.
3. Se uma chamada antiga ou manipulada tentar gerar Pix mesmo assim, a função de cobrança retorna que o barbeiro ainda não criou a conta.
4. Se a conta aprovada não tiver a credencial do provedor correspondente, a cobrança também é recusada.
5. Nenhum fallback usa a conta de outro barbeiro ou do dono da barbearia.

## Verificação

- 6 testes de regras passaram: conta ausente/em análise/recusada, Woovi, Mercado Pago, credencial obrigatória e exceção do Túlio.
- Checagem de tipos das funções de cobrança e do endpoint legado passou.
- Compilação mais recente do aplicativo: `build OK`.
- Página pública aberta no navegador sem erros de execução.
- O aviso de segurança introduzido na primeira versão da consulta foi corrigido; a varredura final não aponta as novas tabelas ou funções. Permanecem 121 achados antigos fora deste escopo.
- Não foi possível executar o fluxo autenticado completo porque o Supabase externo não permite ao ambiente de teste emitir uma sessão. Nenhuma cobrança Pix real foi criada nesta etapa.
