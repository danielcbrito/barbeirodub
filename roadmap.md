# Payment provider cleanup

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
