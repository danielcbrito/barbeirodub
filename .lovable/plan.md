# Isolamento financeiro por barbeiro (Pix no nome de cada barbeiro)

## Objetivo
Cada barbeiro (Júnior Cortes, Pedro Santos e demais) recebe o Pix dos clientes no próprio CPF/CNPJ. O comprovante do cliente mostra o nome do barbeiro, não o do Túlio. O Túlio continua com a conta principal dele, sem receber dinheiro de outros barbeiros.

## Fluxo do barbeiro (tudo dentro do app)
1. Carteira → "Ativar recebimento no meu nome".
2. Preenche: nome completo, CPF/CNPJ, data de nascimento, telefone, e-mail, endereço e chave Pix pessoal.
3. O app cria a conta dele na Woovi automaticamente (sem API, sem AppID visível).
4. Se a Woovi pedir verificação (selfie/documento), o app mostra o link e o status: "Em análise", "Aprovada", "Recusada — corrigir dados".
5. Aprovado: Pix dos clientes dele passa a cair na conta dele; saque para a chave Pix pessoal.

## Fluxo do cliente
- Nada muda: agenda, paga Pix (copia e cola/QR). Recebedor = barbeiro escolhido.
- Enquanto o barbeiro não estiver aprovado, o Pix dele continua pausado (pagamento presencial), como hoje.

## Barbearias e comissão
- Barbeiro parceiro (ex.: Pedro na barbearia do Túlio): cobrança na conta do Pedro; comissão da barbearia separada automaticamente para a conta do dono.
- Dono (Júnior): 100% na conta dele.

## Aplicação imediata
- Júnior Cortes e Pedro Santos: cadastro de recebimento já aparece pendente na Carteira com os dados que já temos preenchidos; eles só confirmam e concluem a verificação.
- Túlio: mantém conta principal; só garantimos que nenhum Pix de outro barbeiro caia nela.
- Saldos atuais nas subcontas: continuam sacáveis; nada é movido sem o saldo real conferido.

## Detalhes técnicos
- Passo 0 (bloqueante): confirmar na documentação/suporte Woovi a API de parceiro para criar empresa/conta própria por CPF e obter AppID por conta. Subcontas atuais ficam sob o CPF do Túlio e não resolvem o comprovante. Se a API não existir, alternativa: onboarding assistido com link oficial Woovi dentro do app (webview) e vinculação automática.
- Nova tabela `barber_payment_accounts` (barbeiro_id, tenant_id, documento, status de KYC, app_id criptografado/segredo no servidor, chave Pix, timestamps) com RLS: barbeiro vê só a própria; admin do tenant vê status.
- Edge functions: `barber-account-onboard` (cria conta), `barber-account-status` (sincroniza KYC), webhook por conta.
- Helper compartilhado de cobrança passa a escolher o AppID do barbeiro do agendamento; split de comissão para o dono quando parceiro.
- Pix de clientes reativado por barbeiro apenas com status aprovado.
- Testes: escolha da conta por barbeiro, bloqueio sem aprovação, cálculo de comissão.
- Documentar em `docs/` e `AGENTS.md`.
