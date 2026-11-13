# Payment provider cleanup

## Recorrente Pix/cartão, checkout real e segurança
- [x] Confirmar na API oficial Woovi os requisitos e a capacidade de recorrência automática por cartão; não simular renovação se o banco não oferecer esse contrato.
- [x] Exigir e orientar no checkout todos os dados cadastrais necessários para Pix Automático e cartão; CPF/CNPJ tem validação matemática e endereço não usa mais valores inventados.
- [ ] Criar e autorizar uma cobrança Pix Automática real e testar o checkout de cartão com pagador autenticado — exige sessão do barbeiro, aprovação no banco do pagador e cartão/KYC habilitado na Woovi; nenhuma cobrança real foi criada nesta etapa.
- [x] Executar a varredura de segurança e corrigir as cinco exposições críticas e quatro caminhos de busca mutáveis; a segunda varredura terminou com zero erros e três avisos de leitura pública já existentes.

## Central account subscriptions and Túlio subaccount
- [x] Route new tenant-plan Pix Automatic receipts to the Woovi central account by removing every subaccount split.
- [x] Confirm Túlio has a configured subaccount and preserve its funds; no transfer was made without a current bank balance and exact verified amount.
- [x] Enable Woovi's official monthly card checkout with server-side confirmation; card settles to Woovi's configured external receiving account and is not represented as automatic recurrence.
- [x] Test central routing, card confirmation and activation rules; 13 focused tests passed and the build is OK.
- [ ] Verify a real Pix/card payment and current bank balances with an authenticated payer; no real charge or withdrawal was executed.

## Tenant plan checkout and recurring billing
- [x] Replace external card links, hardcoded Pix and client-side activation with a shared Woovi-only checkout for barber and tenant admin.
- [x] Activate only after approved/active bank revalidation; renew only after a completed installment, through the service-only atomic database function.
- [x] Add regression tests for exact correlation, amount, approved mandate and completed installment; 11 focused tests passed.
- [x] Verify the final build, deploy both functions and confirm invalid browser tokens/webhook signatures are rejected; build OK and both checks returned 401.
- [ ] Complete an authenticated real Pix Automatic authorization and verify the first payment, later installments and webhook events — requires a payer and Woovi production events; this external Supabase session cannot be injected into the browser test.
- [ ] Automatic card recurrence — not offered by the documented Woovi card API; monthly card payment is available, while Pix Automatic remains the automatic renewal method.

## WhatsApp connection investigation
- [x] Compare phone rejection with provider logs and connection flow; specific phone rejection reason absent from available logs.
- [x] Correct confirmed pairing lifecycle and error handling defects; 5 regression tests passed, function deployed.
- [x] Document deployment and real-device verification limits.
- [ ] Confirm successful pairing on the affected phone — requires phone confirmation; external unmanaged authenticated session and internal Evolution/Baileys logs unavailable.

## Report and performance consistency
- [x] Diagnose home/report revenue differences using live data and active callers.
- [x] Unify revenue and period comparisons for all barber/admin profiles.
- [x] Replace partial performance scoring with measurable multi-factor evaluation and explicit missing-data states.
- [x] Test shared rules and document findings and verification limits (19 tests passed; build OK).
- [ ] Verify home → report parity inside a real authenticated account — external unmanaged Supabase session unavailable.
- [ ] Add score inputs for price affordability, actual capacity and app usage — requires market benchmarks and agreed event instrumentation; absent inputs explicitly marked, not invented.

- [x] Audit repository frontend, functions and public database function references.
- [x] Remove operational Asaas API calls from repository; preserve financial history and existing Woovi/Efí flows.
- [x] Correct charge confirmation, renewal retry, trusted prices and legacy QR contract; run 8 unit tests and check public preview.
- [x] Save corrected payment audit and observed errors in project documents.
- [ ] Verify authenticated real Pix, subscriptions, shop, withdrawals and bank callbacks — blocked by unavailable external authenticated test session and unverified bank event setup.
- [ ] Confirm removal of external Asaas secrets and two legacy subaccount endpoints — tools returned not found / deletion failed, external state not confirmed.
- [ ] Complete partial-credit + online payment parity — currently fails closed; needs atomic credit-consumption design and validation before enabling.
