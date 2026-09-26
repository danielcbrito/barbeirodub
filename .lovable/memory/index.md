# Memory: index.md
Updated: today

# Project Memory

## Core
High contrast B&W modern clean design. No icons in primary buttons. iPhone-style blur for modals.
React 18: MUST use @radix-ui/react-tooltip v1.1.8. Edge functions return `{success, data, error}`.
Toda regra e alteração do app Barbeiro deve ser global e multi-tenant; nunca usar nomes ou IDs pessoais como exceção.
4 Roles: Client, Barber, Admin, IT. Dual-roles prioritize Barber profile over Admin.
Appointments auto-confirmed (no Pending), cancel only. Same-day bookings require 30m advance.
Manual bookings bypass conflict validation. Active plans force subscription payment method.
Asaas: DUB shared account with subaccounts. PIX withdrawals require 4-digit PIN.
WhatsApp: Evolution API. Shop-First Outbound priority (Owner > Unit > Barber).
Toda mudança no app Barbeiro reflete em teste.barbeiro; no app Cliente reflete em teste.cliente.

## Memories
- [Test accounts parity](mem://preferences/test-accounts-parity) — Barber/client changes must apply to teste.barbeiro and teste.cliente accounts
- [Barber balance calculation](mem://features/barber-balance-calculation) — RPC aggregates Asaas, cash, gateway fees for withdrawals
- [Staff RLS access](mem://data-visibility/tenant-staff-rls-access) — RLS rules for tenant admins and barbers reading schedules/subscriptions
- [Admin schedule management](mem://data-visibility/tenant-admin-schedule-management) — Tenant admins have full RLS for unit schedules and exceptions
- [Subscription barber assignment](mem://features/subscription-barber-assignment-logic) — Barber ID is linked to contract, separate from gateway split
- [Asaas integration model](mem://fintech/asaas-integration-model) — Shared DUB account, subaccounts for barbers, 13 BRL activation fee
- [Reports module](mem://features/reports-statistics-module) — Global/personal metrics for schedules, revenue, active/pending subscribers
- [Cakto integration](mem://fintech/cakto-integration) — Webhooks, pricing tiers, automated tenant_assinaturas unlocking
- [Client management](mem://features/client-management-system) — Multi-tenant client table, shared emails, WhatsApp focus
- [Public tenant profile](mem://features/tenant-public-profile-system) — Canonical landing page with visual identity and team portfolio
- [Loyalty program](mem://business-rules/loyalty-program-implementation) — Dynamic targets (e.g. 8 cuts) synced via Realtime
- [Client tenant resolution](mem://architecture/client-tenant-context-resolution) — Booking tenant resolution (URL > explicit > fav > active sub > latest)
- [Admin/Barber prioritization](mem://auth/admin-barber-context-prioritization) — Dual-role users default to barber context to prevent data contamination
- [Auto-confirmation](mem://business-rules/appointment-auto-confirmation) — All appointments auto-confirmed, 'Pending' tab removed
- [Cancellation policy](mem://business-rules/appointment-cancellation-policy) — Cancel only, mandatory reason, auto refunds and webhooks
- [AI Support Agent](mem://features/ai-support-agent-autonomo) — Autonomous agent diagnosing user data and opening tickets as fallback
- [WhatsApp Reminders](mem://features/sistema-lembretes-whatsapp) — Auto reminders 2h15m before appointment, log checked for dupes
- [Service duration customization](mem://features/customizacao-duracao-servico-barbeiro) — Barbers can customize service duration locally
- [Asaas withdrawal automation](mem://features/autorizacao-automatica-saque-asaas) — Webhook auto-approves withdrawals, no SMS/App token
- [Asaas PIX subaccount keys](mem://features/autenticacao-subcontas-asaas-pix) — Withdrawals use individual subaccount API keys
- [Staff exclusion](mem://data-integrity/staff-exclusion-logic) — Barbers excluded from CRM/marketing lists
- [WhatsApp automation numbers](mem://business-rules/whatsapp-outbound-number-isolation) — Dedicated business numbers for automation instances
- [Revenue data sync](mem://business-rules/financial-revenue-standardization-logic/dashboard-report-sync) — Revenue = completed services + cash plans. 12 month rolling window
- [PIX revenue isolation](mem://security/revenue-data-isolation-enforcement) — PIX revenue strictly scoped to avoid tenant data leakage
- [Broadcast audience](mem://features/broadcast-audience-permissions) — Barbers see 'My Clients', Admins can broadcast to 'All Clients'
- [Multi-unit staffing](mem://architecture/multi-unit-staffing-and-context) — Barbers can work across units, time slots isolated by active unit
- [Maintenance mode](mem://features/maintenance-mode-logic) — 2s polling, pre-maintenance warnings, device authorization bypass
- [Booking availability lock](mem://architecture/booking-logic-and-availability) — 15m atomic lock for double booking, 30m same-day advance rule
- [WhatsApp routing](mem://architecture/whatsapp-communication-architecture) — Evolution API proxy, Owner > Unit > Barber routing priority
- [PIX withdrawal UI](mem://fintech/pix-withdrawal-system) — 4-digit PIN, centavos-first input, bank profile mapping
- [SaaS Pricing](mem://business-rules/saas-subscription-and-pricing) — 7-day trial, barber-count paywalls, store module exempt
- [Access control model](mem://auth/access-control-model) — 4 levels: Client, Barber, Admin, IT. Barber unit roles sync
- [Asaas KYC onboarding](mem://fintech/asaas-onboarding-integration) — Edge function for KYC, shared account for minors, gate stack protection
- [Employee wallet bypass](mem://fintech/employee-wallet-onboarding-bypass) — Non-owner barbers skip KYC, use shared owner wallet
- [Multi-unit framework](mem://architecture/multi-unit-management-framework) — Hub and spoke units, total data wipe on deletion
- [Manual booking conflicts](mem://business-rules/isolamento-conflito-agenda-manual) — Manual booking allows intentional slot overlapping
- [Subscription booking flow](mem://business-rules/enforced-subscription-booking-flow) — Active plans force subscription payment method in checkout
- [IT Panel hierarchy](mem://architecture/ti-panel-hierarchical-structure) — Scoped context per tenant for support operations
- [IT Support Role](mem://roles/ti-suporte-controle-global) — Magic link impersonation, scheduled changes, financial auditing
- [IT Tenant Hub](mem://features/ti-barbearia-management-hub) — 4 sub-screens for tenant management in IT panel
- [IT Financial Tools](mem://features/ti-financial-monitoring-tools) — Global revenue auditing, RPC credit adjustments
- [IT granular permissions](mem://auth/ti-granular-permissions-architecture) — 15 modules with boolean flags, legacy admins get full access
- [Store architecture](mem://features/multi-tenant-store-architecture) — Physical products, 15m stock lock, statuses: waiting -> picked up
- [Scheduled operations](mem://features/scheduled-operations-management) — Deferred execution of critical system changes
- [React 18 Radix constraint](mem://constraints/react-18-radix-compatibility) — Keep radix tooltip 1.1.8 to avoid use-ref null errors
- [IT Role management](mem://security/ti-role-management-authorization) — IT role can insert/delete in user_roles
- [Role update exclusivity](mem://auth/ti-role-update-exclusivity) — Role updates wipe previous roles to prevent stacking
- [Cart persistence](mem://architecture/client-store-cart-persistence) — Cart state in-memory only at App root level
- [Store global admin](mem://features/store-global-administration-and-diagnostics) — IT/Admin drill-down view without session swap
- [IT global access](mem://data-visibility/ti-global-access-policies) — IT read-only global, update products, no delete
- [Barber store read-only](mem://features/barber-store-read-only-access) — Barbers see store in read-only mode
- [Revenue data source](mem://business-rules/financial-revenue-data-source-parity) — Revenue tied to 'agendamentos' price, not 'pagamentos'
- [Edge function standards](mem://architecture/edge-function-architecture-and-standards) — return {success, data, error}, redeploy on schema change
- [Unified Auth](mem://auth/unified-authentication-and-onboarding-strategy) — Pre-check email existence on login to prevent accidental signup
- [Owner signup routing](mem://auth/owner-signup-routing) — “Criar conta” creates a new barbershop owner, never a client account
- [IT store privacy](mem://security/ti-store-privacy-and-access-restrictions) — IT cannot see store revenue or admin notes
- [Asaas renewal logic](mem://fintech/asaas-renewal-webhook-logic) — 'renewal_' prefix resets plan cycle uses
- [Subscription cycle](mem://business-rules/plan-subscription-cycle-management) — In-place DB update. Reset cycle on renewal. Early renewal when uses=0
- [Plan service binding](mem://business-rules/plan-service-binding) — Plans locked to specific servico_id
- [Product images](mem://design/product-image-constraints) — 1:1 crop, max 3 images per product
- [Asaas Customer ID](mem://fintech/asaas-customer-id-mapping) — Maps profile to avoid gateway duplicate accounts
- [Admin plan management](mem://features/tenant-admin-plan-management) — Cash renewals reset 30-day cycle
- [Global admin exceptions](mem://features/global-admin-unit-exception-logic) — Multi-unit holiday exceptions
- [Plan polling](mem://features/plan-renewal-polling-logic) — 4s polling during PIX plan renewals
- [Client granular blocking](mem://features/client-blocking-granular-logic) — Block scopes: barber, unit, tenant. Real-time list updates
- [Manual booking isolation](mem://features/manual-booking-barber-isolation) — Manual schedules isolate validation per barber
- [Renewal notifications](mem://features/subscription-renewal-app-notifications) — In-app notification on plan renewal
- [IT client credentials](mem://features/ti-client-credentials-access) — Reset 8-char client passwords
- [Test environment](mem://infrastructure/test-environment-and-isolation) — is_test flag hides from metrics. Idempotent setup
- [Test paywall bypass](mem://business-rules/test-account-paywall-bypass) — Test accounts bypass SaaS paywalls
- [Test auto-login](mem://features/ti-auto-login-preview-mechanism) — /test-login route injects credentials into iframe
- [Role priority](mem://auth/role-resolution-priority-logic) — Barber prioritized over admin if not owner
- [WA shared connectivity](mem://architecture/whatsapp-shared-connectivity-logic) — Barber WA falls back to tenant connection
- [IT Impersonation](mem://auth/ti-impersonation-redirection-logic) — Next param forces app navigation
- [Blocked client UI](mem://features/client-blocking-realtime-visibility) — Blocked clients see 'establishment unavailable'
- [Test IDs](mem://infrastructure/ti-test-account-identifiers) — Fixed UUIDs and password DubTeste@2026 for tests
- [Design system](mem://style/design-system-standards) — Modern clean B&W, no icons in primary buttons
- [Store technical debt](mem://features/store-technical-architecture-and-debt) — Duplicated fields, ignore unused categories tables
- [WA Outbound policy](mem://business-rules/whatsapp-sender-priority-enforcement) — Shop-First outbound strictly enforced
- [Scheduling hierarchy](mem://architecture/scheduling-availability-hierarchy) — Barber Exception > Global Exc > Barber Config > Global Conf
- [Efí PIX env routing](mem://infrastructure/efi-pix-environment-routing) — is_test tenants → homologação; demais → produção. Secrets *_PROD para produção
