<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## DIRETRIZES OBRIGATÓRIAS DO SISTEMA: DESIGN 100% SÉRIO, EXECUTIVO E MINIMALISTA
Todas as alterações, novos componentes, telas e fluxos no sistema Dub / BarbeiroDub devem seguir rigorosamente o padrão registrado em `.agents/rules/design-system-minimalista.md`:
1. **Estética Executiva e Sóbria (Apple / Linear / Raycast)**: Design limpo, profissional, monocromático e elegante. Sem brinquedos de IA, sem badges circenses, sem caixas coloridas ao redor de ícones.
2. **Zero Gimmicks de IA**: Proibido usar ícones de estrelas/brilho (`Sparkles`), rótulos infantis como "mágico", "com IA", "✨", ou emojis como 🤖. Utilize termos profissionais como "Aprimorar texto", "Atendimento Automático", "Otimizar".
3. **Botões de Ação Primários**: Botões principais confortáveis (`h-[52px]` ou `h-[54px]`), formato tradicional de pílula (`rounded-full` ou `rounded-2xl`), largura total (`w-full`), cores sólidas (`bg-foreground text-background`), texto direto e sem setas desnecessárias.
4. **Campos de Busca Amplos**: Inputs de busca no formato pílula `h-[54px] rounded-full`, com sobreposição em tela cheia via Portal (`createPortal(..., document.body)` com `fixed inset-0 z-[999999]`), autofocus imediato e visual limpo.
5. **Consistência Total**: Aplicar em todo o app (Dashboard Inicial, Agenda, Disparos, Perfil, Configurações e Telas de Clientes).

## Authenticated client operations
- Call protected client-management functions through the shared authenticated invocation helper; it sends the current session token, refreshes once on 401, and returns recoverable errors without bypassing permissions.

## WhatsApp connection lifecycle
- Validate Evolution HTTP status before session mutation or accepting pairing codes; only 404 means a missing instance, and failed logout must stop pairing to avoid reusing stale sessions.
- Serialize pairing and QR mutations in the connection screen and discard pre-mutation status responses; server expiry is authoritative and provider bodies containing credentials must not be logged.

## Payment architecture
- Create online Pix charges through the shared charge helper and settle them through the service-only atomic confirmation function after bank revalidation; this prevents duplicate financial writes and untrusted client prices.
- Preserve historical provider columns and migrations as audit records, not as active integration paths; removing a provider must not erase financial history.
- Wallet balance shown to barbers/admins must be the raw Woovi subaccount balance (woovi-wallet and store-api woovi_get_balance); main-account liquidity may only gate withdrawals, never reduce the displayed balance — prevents app/bank divergence.
- Tenant-plan receipts must go to the Woovi main account without subaccount splits; only bank revalidation plus the service-only atomic confirmation function may activate or renew access, and a status check must never advance the due date. Pix Automatic recurs monthly; Woovi card checkout is a confirmed monthly payment, not a simulated card recurrence, and settles to the external receiving account configured by Woovi. Both methods require a valid payer name, CPF/CNPJ, email, phone and complete address; never substitute invented address fields.

## Reports architecture
- Use `useBarberReportData` and `barberReportMetrics` for live home/report revenue and comparisons; shared scoped pagination prevents divergent totals and PostgREST truncation.
- Recognize completed non-free standalone services at final appointment price plus recorded cash and paid non-cash subscription receipts; never estimate missing months or add plan-use prices again.
- Compute performance only from observed factors with coverage and absent-data states; compare elapsed monthly days for performance trends to avoid penalizing unfinished periods.
