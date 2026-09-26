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
