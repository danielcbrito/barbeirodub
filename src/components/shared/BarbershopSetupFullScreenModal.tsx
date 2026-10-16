import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings2,
  ChevronRight,
  ChevronLeft,
  Check,
  Building2,
  Scissors,
  Clock,
  Wallet,
} from "lucide-react";
import { SetupStep } from "@/hooks/useSetupCompletion";

interface BarbershopSetupFullScreenModalProps {
  open: boolean;
  onClose: () => void;
  percentage: number;
  steps: SetupStep[];
  basePath: string;
}

/* ─── Ícone Oficial do WhatsApp (usado em Atendimento & Notificações, transparente, sem fundo branco) ─── */
function WhatsAppOfficialIcon({ className = "w-9 h-9" }: { className?: string }) {
  return (
    <img
      src="/whatsapp-logo.png"
      alt="WhatsApp"
      className={className || "w-9 h-9 object-contain shrink-0"}
    />
  );
}

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dados_gerais: Building2,
  servicos: Scissors,
  horarios: Clock,
  carteira: Wallet,
};

const STEP_SUBTITLES: Record<string, string> = {
  dados_gerais: "Nome, telefone e endereço da barbearia",
  servicos: "Cortes, barbas e serviços disponíveis",
  horarios: "Dias e horários de atendimento",
  whatsapp: "Lembretes e confirmações automáticas",
  carteira: "Chave Pix e recebimentos digitais",
};

export const BarbershopSetupFullScreenModal: React.FC<BarbershopSetupFullScreenModalProps> = ({
  open,
  onClose,
  percentage,
  steps,
  basePath,
}) => {
  const navigate = useNavigate();
  // view: "intro" (Tela 1 inteira) | "steps" (Tela 2 com as etapas a configurar)
  const [view, setView] = useState<"intro" | "steps">("intro");

  if (!open) return null;

  const pendingSteps = steps.filter((s) => !s.completed);
  const completedSteps = steps.filter((s) => s.completed);

  const handleStepClick = (route?: string) => {
    onClose();
    if (route) {
      navigate(route);
    } else {
      navigate(`${basePath}/dados-empresa`);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-background dark:bg-[#000000] text-foreground overflow-hidden select-none animate-fade-in">
      {/* ─────────────────────────────────────────────────────────────
       * TELA 1: INTRO EM TELA INTEIRA (Responsivo, 100% Estático, Minimalista)
       * ───────────────────────────────────────────────────────────── */}
      {view === "intro" ? (
        <div className="w-full max-w-md mx-auto h-full flex flex-col justify-between px-5 sm:px-6 py-8 sm:py-10 overflow-hidden">
          {/* Espaçador superior */}
          <div className="shrink-0 h-2" />

          {/* Centro da Tela 1 */}
          <div className="my-auto py-2 text-center space-y-6">
            {/* Ícone Puro Apple Minimalista: Sem caixa de fundo */}
            <div className="flex items-center justify-center">
              <Settings2 className="w-11 h-11 sm:w-12 sm:h-12 text-foreground stroke-[1.6]" />
            </div>

            {/* Título e Subtítulo com tipografia nítida e direta */}
            <div className="space-y-2 max-w-sm mx-auto">
              <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground">
                Configure sua barbearia
              </h1>
              <p className="text-[14px] sm:text-[14.5px] text-muted-foreground font-normal leading-relaxed">
                Complete as etapas essenciais para começar a operar a 100% e liberar todos os recursos do seu sistema.
              </p>
            </div>

            {/* Barra de Progresso Fluida e Minimalista */}
            <div className="w-full max-w-xs sm:max-w-sm mx-auto space-y-2 pt-1">
              <div className="flex items-center justify-between text-[13px] px-0.5">
                <span className="text-muted-foreground font-medium">Progresso</span>
                <span className="text-foreground font-semibold tabular-nums">{percentage}%</span>
              </div>
              <div className="w-full bg-secondary/80 dark:bg-white/[0.08] rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-[#34C759] h-full rounded-full transition-all duration-700"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <p className="text-[12px] text-muted-foreground/75 text-center">
                {pendingSteps.length === 1
                  ? "Resta apenas 1 etapa pendente"
                  : `Restam ${pendingSteps.length} etapas para concluir`}
              </p>
            </div>
          </div>

          {/* Rodapé da Tela 1: Dois botões cápsula oficiais de 48px */}
          <div className="space-y-2.5 pt-4 pb-2 w-full max-w-sm mx-auto shrink-0">
            <button
              type="button"
              onClick={() => setView("steps")}
              className="w-full h-12 rounded-full bg-foreground text-background font-semibold text-[15px] shadow-xs hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center"
            >
              Configurar agora
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full h-12 rounded-full border border-border/70 dark:border-white/15 bg-transparent hover:bg-secondary/40 dark:hover:bg-white/[0.06] text-foreground font-medium text-[14.5px] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center"
            >
              Configurar mais tarde
            </button>
          </div>
        </div>
      ) : (
        /* ─────────────────────────────────────────────────────────────
         * TELA 2: LISTA DE ETAPAS PENDENTES ("O que precisa ser configurado")
         * Botão voltar no topo alto, distância confortável até o título,
         * e ícone oficial do WhatsApp gigante no slot sem nenhum fundo
         * ───────────────────────────────────────────────────────────── */
        <div className="w-full max-w-md lg:max-w-lg mx-auto h-full flex flex-col px-4 sm:px-6 pt-2 pb-6 sm:pt-3 sm:pb-8 overflow-hidden">
          {/* Top Bar de Navegação: Colada no topo superior */}
          <div className="w-full flex items-center justify-between pt-1 pb-1 shrink-0">
            <button
              type="button"
              onClick={() => setView("intro")}
              className="h-9 px-2 -ml-1 rounded-xl flex items-center gap-1 text-[14.5px] font-semibold text-foreground hover:bg-secondary active:scale-95 transition-all cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
              <span>Voltar</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="text-[13.5px] font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors px-1"
            >
              Mais tarde
            </button>
          </div>

          {/* Cabeçalho da Tela 2: Espaçamento respirado e elegante entre o Voltar e o Título */}
          <div className="w-full space-y-1.5 pt-6 pb-5 sm:pt-7 sm:pb-6 shrink-0 text-left">
            <h2 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground leading-tight">
              O que precisa ser configurado
            </h2>
            <p className="text-[13.5px] sm:text-[14px] text-muted-foreground font-normal">
              Toque em qualquer etapa para abrir e preencher:
            </p>
          </div>

          {/* Lista de Etapas (com rolagem suave contida) */}
          <div className="flex-1 min-h-0 w-full space-y-2.5 py-1 overflow-y-auto no-scrollbar">
            {/* 1. Etapas Pendentes */}
            {pendingSteps.map((step) => {
              const IconComp = STEP_ICONS[step.id] || Building2;
              const subtitle = STEP_SUBTITLES[step.id] || "Toque para configurar";

              return (
                <div
                  key={step.id}
                  onClick={() => handleStepClick(step.route)}
                  className="w-full rounded-2xl bg-card dark:bg-[#141416] border border-border/80 dark:border-white/10 hover:border-foreground/30 p-4 flex items-center justify-between gap-3.5 shadow-2xs cursor-pointer active:scale-[0.99] transition-all group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Ícone da Etapa: WhatsApp oficial /whatsapp-logo.png sem fundo branco, ocupando o slot de forma limpa */}
                    {step.id === "whatsapp" ? (
                      <WhatsAppOfficialIcon className="w-9 h-9 shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-secondary dark:bg-[#202024] border border-border/50 dark:border-white/10 flex items-center justify-center shrink-0">
                        <IconComp className="w-5 h-5 text-foreground" strokeWidth={1.8} />
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-foreground tracking-tight truncate">
                        {step.label}
                      </p>
                      <p className="text-[12px] text-muted-foreground font-normal truncate mt-0.5">
                        {subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-[13px] font-semibold text-foreground shrink-0 group-hover:translate-x-0.5 transition-transform">
                    <span>Configurar</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}

            {/* 2. Etapas Concluídas */}
            {completedSteps.length > 0 && (
              <div className="pt-2.5 space-y-2 w-full">
                <span className="text-[11.5px] font-semibold text-muted-foreground/75 uppercase tracking-wider px-1 block text-left">
                  Já configurado ({completedSteps.length})
                </span>
                {completedSteps.map((step) => {
                  return (
                    <div
                      key={step.id}
                      onClick={() => handleStepClick(step.route)}
                      className="w-full rounded-2xl bg-secondary/35 dark:bg-white/[0.03] border border-border/40 p-3.5 flex items-center justify-between gap-3 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {step.id === "whatsapp" ? (
                          <div className="relative w-8 h-8 shrink-0 flex items-center justify-center">
                            <WhatsAppOfficialIcon className="w-8 h-8 shrink-0" />
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#34C759] flex items-center justify-center border-2 border-background">
                              <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                            </div>
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-xl bg-[#34C759]/15 flex items-center justify-center shrink-0">
                            <Check className="w-4 h-4 text-[#34C759]" strokeWidth={2.5} />
                          </div>
                        )}
                        <span className="text-[14px] font-medium text-foreground truncate">
                          {step.label}
                        </span>
                      </div>

                      <span className="text-[12px] font-medium text-muted-foreground shrink-0">
                        Editar
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Rodapé da Tela 2 */}
          <div className="pt-3 pb-1 w-full shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full h-12 rounded-full border border-border/70 dark:border-white/15 bg-secondary/40 dark:bg-white/[0.05] hover:bg-secondary text-foreground font-semibold text-[14.5px] shadow-2xs active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center"
            >
              Continuar no painel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
