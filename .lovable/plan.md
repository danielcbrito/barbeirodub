# Isolamento financeiro por barbeiro (Pix no nome de cada barbeiro)

## O que encontrei hoje
- Todo Pix de cliente é gerado pela conta principal Woovi da plataforma (uma única credencial `WOOVI_APP_ID`) em `_shared/woovi-charge.ts`.
- O valor do barbeiro é repassado por divisão para a **subconta** (`barbeiros.woovi_pix_key`, `woovi_subaccount_name`).
- Subconta Woovi é só um saldo interno da conta principal: o recebedor que aparece no comprovante do cliente é sempre o titular da conta principal (Túlio). Por isso trocar de subconta não resolve o problema fiscal nem o nome no comprovante.
- Telas atuais do barbeiro para a carteira: `CarteiraPage`, `WooviWalletSheet`, `WalletAccountGate`, `CreateBankBanner`; admin em `AdminWoovi`.

## Solução proposta
Cada barbeiro passa a ter a **própria conta Woovi** (CPF ou CNPJ dele, aberta e aprovada pela Woovi com KYC). O app guarda a credencial de API dessa conta de forma protegida e gera o Pix do cliente direto na conta do barbeiro. O dinheiro nunca passa pela conta principal.

Comissão do salão-parceiro (barbeiro que atende em barbearia de terceiro): a cobrança sai no nome do barbeiro e a cota-parte do salão é enviada por divisão para a conta do dono do salão, conforme o percentual configurado — modelo da Lei do Salão-Parceiro.

## Fluxo de ativação no app do barbeiro (Carteira > Conta de recebimento)
1. Conferir dados: nome completo/razão social, CPF/CNPJ (validação de dígitos), e-mail, telefone, chave Pix principal.
2. Passo guiado para abrir conta na Woovi (link oficial) e aguardar aprovação.
3. Colar a chave de API (AppID) da conta dele. O sistema testa a chave, confirma que o titular retornado pela Woovi bate com o CPF/CNPJ informado e salva apenas no servidor.
4. Registrar automaticamente o aviso de pagamento (webhook) na conta dele.
5. Ativar saque automático para a própria chave Pix (opcional).
6. Status visível: Pendente / Em análise / Ativa / Com erro, com badge na aba Mais.

## Regras de transição
- Barbeiro sem conta própria ativa: Pix online desativado para ele (cliente paga presencialmente). Nenhum Pix novo sai na conta principal em nome de outro barbeiro.
- Saldo atual nas subcontas continua sacável até zerar; histórico e subcontas preservados como registro.
- Assinaturas da plataforma DUB continuam na conta principal (já é receita da DUB).

## Detalhes técnicos
- Nova tabela `barbeiro_contas_recebimento` (barbeiro_id, tipo_documento, documento, titular, status, chave_pix, webhook_id, verificado_em, erro). RLS: barbeiro vê só a sua; admin do tenant vê status, nunca a credencial.
- Credencial AppID cifrada (Vault/pgsodium ou `encrypt-pix-key` existente), lida apenas por Edge Functions com service role.
- Nova Edge Function `woovi-connect-account` (validar AppID, conferir titular, registrar webhook, salvar).
- `_shared/woovi-charge.ts`: escolher a credencial do barbeiro do agendamento; split só para cota do salão parceiro; bloquear se não houver conta ativa.
- `woovi-webhook`: identificar a conta de origem e validar assinatura por conta; confirmação continua pela função atômica service-only após revalidar a cobrança no banco da conta certa.
- Carteira/saque/saldo: ler saldo da conta própria quando existir; subconta antiga apenas para esvaziar.
- Testes: seleção de credencial, bloqueio sem conta, cálculo da cota-parte, validação de titular.
- Documentar em `docs/` e `AGENTS.md`.

## Pontos a confirmar com você
- A Woovi exige que cada barbeiro abra a conta própria (não há API de criação de conta de terceiros documentada). Se vocês têm parceria Woovi para criação de contas por API, o passo 2 vira automático.
- Validação fiscal/jurídica do contrato salão-parceiro fica com o contador.
