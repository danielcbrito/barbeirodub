# Padrão de Design: Gavetas (Bottom Sheets) e Modais Executivos DUB

Esta regra estabelece os padrões visuais, tipográficos e de interação para **todas as gavetas (bottom sheets) e modais** do sistema. Sempre que criar, revisar ou refatorar qualquer gaveta, gaveta de confirmação ou modal no aplicativo, siga estritamente estas diretrizes.

---

## 1. Hierarquia Tipográfica Rigorosa

| Elemento | Tamanho Tailwind | Peso | Propósito |
| :--- | :--- | :--- | :--- |
| **Título principal** | `text-[24px]` | Bold (`font-bold`, 700) | O primeiro elemento visual textual a chamar a atenção. |
| **Descrição** | `text-[15px]` | Regular (`font-normal`, 400) | Explica a situação sem competir visualmente com o título (`text-muted-foreground`). |
| **Título de bloco/seção** | `text-[13px]` | Semibold (`font-semibold`, 600) | Identifica a seção em tom neutro (`text-foreground/85`). |
| **Itens do bloco** | `text-[14px]` | Medium (`font-medium`, 500) | Conteúdo claro e direto (`text-foreground`). |
| **Botão principal** | `text-[16px]` | Semibold (`font-semibold`, 600) | CTA definitivo com contraste total (`bg-foreground text-background`). |
| **Ação secundária** | `text-[14px]` | Medium (`font-medium`, 500) | Ação de retorno/cancelamento sem peso visual pesado (`text-muted-foreground`). |

---

## 2. Espaçamento e Proporções

- **Margem lateral (padding interno):** 24px (`p-6`).
- **Entre título e descrição:** `mt-2.5` a `mt-3` (10 a 16px).
- **Entre descrição e bloco de conteúdo/pendências:** 20px a 24px (`space-y-6`).
- **Entre bloco e botões de ação:** 24px (`pt-2 space-y-2.5`).
- **Altura da gaveta:** Deve acompanhar o conteúdo naturalmente (`h-auto`, `max-h-[85vh]`), preservando espaço e contexto da tela anterior.

---

## 3. Blocos de Pendências, Avisos e Alertas

- **Fundo:** Extremamente suave (`bg-rose-500/[0.03] dark:bg-rose-500/[0.06]`), nunca sólido ou saturado.
- **Borda:** Extremamente discreta (`border border-rose-500/15`).
- **Título do bloco:** Em tom neutro (`text-foreground/85`), com contagem ou badge sutil (`Informações pendentes` e badge discreto `2 pendentes`).
- **Itens da lista:** Com espaçamento generoso (`space-y-2.5` ou `space-y-3`), com micro-indicador visual suave (`w-1.5 h-1.5 rounded-full bg-rose-500/80`).

---

## 4. Botão Principal e Ações

- **Botão Principal:**
  - Altura: 56px (`h-14` ou `h-[56px]`).
  - Raio da borda: 28px (`rounded-[28px]`).
  - Tipografia: 16px semibold (`text-[16px] font-semibold`).
  - Sem sombras duras ou gradientes exagerados; apenas acabamento de toque tátil (`active:scale-[0.98] transition-all`).
- **Ação Secundária:**
  - Altura: 44px (`h-11`).
  - Tipografia: 14px medium (`text-[14px] font-medium`).
  - Estilo discreto e transparente (`hover:text-foreground`).
- **Eliminação de redundância:** Evite ter o botão "X" de fechar no topo e o botão "Voltar" no rodapé fazendo exatamente a mesma coisa sem propósito. Prefira o dismiss natural via backdrop e a ação secundária clara no rodapé.
