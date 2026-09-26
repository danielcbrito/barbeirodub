# DIRETRIZES OBRIGATÓRIAS DE DESIGN: SISTEMA 100% SÉRIO, EXECUTIVO E MINIMALISTA

Esta regra é mandatória para todo o sistema da barbearia (Dub/BarbeiroDub). Qualquer tela, componente, modal ou fluxo novo ou modificado deve seguir rigorosamente estes princípios.

---

## 1. Filosofia Visual (Estilo Apple / Linear / Raycast)
- **Tom de voz e estética**: 100% sério, maduro, corporativo e executivo. O sistema não é um protótipo, nem uma demonstração de brinquedos de IA.
- **Minimalismo refinado**: Tipografia limpa, hierarquia visual nítida, contrastes precisos e espaçamento balanceado.
- **Cores sóbrias e monocromáticas**: Utilizar predominantemente `foreground`, `background`, `muted-foreground`, `border`, `card`. Evitar caixas de cores aleatórias atrás de ícones. Cores de destaque (verde esmeralda para confirmação/sucesso, vermelho/rosa sutil apenas para perigo/cancelamento) devem ser usadas com máxima parcimônia e sofisticação.

---

## 2. Eliminação Total de Gimmicks de IA ("Anti-AI Fluff")
- **PROIBIDO o uso de ícones de estrelas/brilho (`Sparkles`)**: Nunca use `Sparkles` para enfeitar botões, títulos, cards ou avatares.
- **PROIBIDO vocabulário infantilizado de IA**: Não utilize termos como "com Inteligência Artificial", "mágico", "gerar com IA", "✨ Sugestão da IA", "robô".
- **Substituições sérias**:
  - Em vez de *"Melhorar com IA"*, utilize *"Aprimorar texto"* ou *"Otimizar mensagem"*.
  - Em vez de *"Agente de Inteligência Artificial no WhatsApp"*, utilize *"Atendimento Automático WhatsApp 24h"*.
  - Em vez de *"Análise IA"*, utilize *"Diagnóstico Estratégico"* ou *"Indicadores Operacionais"*.
- **Sem emojis decorativos de IA**: Não utilize emojis como 🤖, ✨, 🪄 em interfaces operacionais.

---

## 3. Botões e Ações Principais
- **Proporção e Altura**: Botões principais de tela mobile devem ter altura confortável de 50px a 54px (`h-[52px]` ou `h-[54px]`), garantindo excelente ergonomia para o polegar ("thumb zone").
- **Estilo Pílula e Largura**: Formato `rounded-full` ou `rounded-2xl` sólido (`bg-foreground text-background`), ocupando a largura total do container quando se tratar da ação primária da tela (ex.: "Finalizar atendimento", "Agendar horário", "Salvar alterações").
- **Tipografia**: `font-bold text-[15px] tracking-tight`. Sem setas ou flechas desnecessárias competindo com o rótulo.
- **Ações secundárias**: Discretas, com `variant="ghost"` ou link sutil, para não disputar atenção com a ação principal.

---

## 4. Campos de Busca e Entradas de Dados
- **Barra de Busca**: Altura `h-[54px]`, formato tradicional de pílula (`rounded-full`), fundo sutil de `card`, borda refinada (`border-border/80`) e padding generoso (`px-5`).
- **Overlays e Modais de Busca (Spotlight)**:
  - Devem ser montados via Portal direto no `document.body` (`createPortal(..., document.body)`).
  - Cobrir 100% da viewport real do dispositivo (`fixed inset-0 z-[999999] w-full h-[100dvh]`).
  - Fundo sólido com desfoque discreto (`bg-background/98 backdrop-blur-md`).
  - Autofocus instantâneo no input ao abrir.
  - Resultados limpos e sóbrios: linha simples com ícone neutro (`text-muted-foreground`), nome legível e indicador de status objetivo. Sem caixas quadradas coloridas atrás de cada ícone.

---

## 5. Telas e Módulos do Sistema
1. **Tela Inicial (Dashboard Admin & Barbeiro)**:
   - Header com saudação elegante, data formatada e sino de notificações minimalista.
   - Barra de busca global ampla.
   - Card de próximo agendamento prioritário no topo (horário em destaque mono/tabular, nome do cliente e status).
   - Card de faturamento limpo com toggle de privacidade (olho aberto/fechado).
   - Banners de conversão/campanhas com visual de produto profissional e refinado.
2. **Agenda**:
   - Visualização de horários clara, status definidos por pontos discretos de cor (`w-1.5 h-1.5 rounded-full`).
   - Modal de detalhes de agendamento com botão primário full-width e ações de planos discretas.
3. **Disparo de Mensagens**:
   - Barra de busca de contatos confortável e ampla (`h-[54px] rounded-full`).
   - Editor de mensagem limpo, com ação de aprimoramento de texto sóbria.
4. **Perfil (Admin & Barbeiro)**:
   - Identidade visual com avatar e informações organizadas.
   - Itens de menu em lista agrupada limpa, sem caixas coloridas ao redor dos ícones, com texto objetivo e chevrons sutis.
