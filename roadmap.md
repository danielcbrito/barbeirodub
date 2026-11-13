# Payment provider cleanup

## Central account subscriptions and Túlio subaccount
- [ ] Route new tenant-plan receipts to the Woovi central account instead of the DUB subaccount.
- [ ] Verify Túlio's current subaccount and available balance before changing any funds or withdrawal path.
- [ ] Confirm Woovi-supported card recurrence and central-account settlement before enabling card checkout.
- [ ] Test payment routing and activation rules; do not claim a real transfer or payment without bank confirmation.

## Tenant plan checkout and recurring billing
- [x] Replace external card links, hardcoded Pix and client-side activation with a shared Woovi-only checkout for barber and tenant admin.
- [x] Activate only after approved/active bank revalidation; renew only after a completed installment, through the service-only atomic database function.
- [x] Add regression tests for exact correlation, amount, approved mandate and completed installment; 11 focused tests passed.
- [x] Verify the final build, deploy both functions and confirm invalid browser tokens/webhook signatures are rejected; build OK and both checks returned 401.
- [ ] Complete an authenticated real Pix Automatic authorization and verify the first payment, later installments and webhook events — requires a payer and Woovi production events; this external Supabase session cannot be injected into the browser test.
- [ ] Card automatic recurring into the DUB Woovi subaccount — blocked by Woovi's documented card settlement outside Woovi subaccounts; the card option explains the limitation instead of simulating support.

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
