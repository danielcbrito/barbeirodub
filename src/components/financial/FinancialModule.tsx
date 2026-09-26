import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Receipt,
  ArrowUpFromLine,
  ArrowDownToLine,
  Settings2,
  ShieldCheck,
  ArrowLeft,
  Wallet,
  QrCode,
} from "lucide-react";
import { FinancialOverview } from "./FinancialOverview";
import { FinancialExtrato } from "./FinancialExtrato";
import { FinancialSaque } from "./FinancialSaque";
import { FinancialDeposito } from "./FinancialDeposito";

import { FinancialConfiguracoes } from "./FinancialConfiguracoes";
import { FinancialSeguranca } from "./FinancialSeguranca";
import { motion, AnimatePresence } from "framer-motion";

export type FinancialRole = "admin" | "barber";

interface FinancialModuleProps {
  role: FinancialRole;
  userId?: string;
  barbeiroId?: string | null;
  userName?: string;
  userPhoto?: string | null;
  onBack?: () => void;
  onPinChanged?: () => void;
}

type FinancialSection =
  | "overview"
  | "extrato"
  | "saque"
  | "deposito"
  | "configuracoes"
  | "seguranca";

/** Itens da sidebar desktop */
const desktopSections: {
  id: FinancialSection;
  label: string;
  icon: typeof LayoutDashboard;
}[] = [
  { id: "overview", label: "Início", icon: LayoutDashboard },
  { id: "extrato", label: "Extrato", icon: Receipt },
  { id: "saque", label: "Sacar", icon: ArrowUpFromLine },
  { id: "deposito", label: "Depositar", icon: ArrowDownToLine },
  { id: "configuracoes", label: "Configurações", icon: Settings2 },
  { id: "seguranca", label: "Segurança", icon: ShieldCheck },
];

/**
 * Módulo Financeiro — Banco Digital
 * Tela fullscreen com navegação própria (esconde nav principal)
 */
export function FinancialModule({
  role,
  userId,
  barbeiroId,
  userName,
  userPhoto,
  onBack,
  onPinChanged,
}: FinancialModuleProps) {
  const [activeSection, setActiveSection] = useState<FinancialSection>("overview");
  const isMobile = useIsMobile();

  /** Sub-back config — permite que filhos (ex: FinancialSaque) controlem o botão de voltar do header */
  const [subBackConfig, setSubBackConfig] = useState<{ label: string; action: () => void } | null>(null);

  

  const renderContent = () => {
    switch (activeSection) {
      case "overview":
        return (
          <FinancialOverview
            role={role}
            userId={userId}
            barbeiroId={barbeiroId}
            userName={userName}
            userPhoto={userPhoto}
            onNavigate={(s) => setActiveSection(s as FinancialSection)}
          />
        );
      case "extrato":
        return <FinancialExtrato role={role} userId={userId} barbeiroId={barbeiroId} />;
      case "saque":
        return <FinancialSaque role={role} userId={userId} barbeiroId={barbeiroId} onNavigate={(s) => setActiveSection(s as FinancialSection)} onBackConfigChange={setSubBackConfig} />;
      case "deposito":
        return <FinancialDeposito role={role} userId={userId} barbeiroId={barbeiroId} />;
      case "configuracoes":
        return <FinancialConfiguracoes role={role} userId={userId} barbeiroId={barbeiroId} onBackConfigChange={setSubBackConfig} />;
      case "seguranca":
        return <FinancialSeguranca role={role} userId={userId} onPinChanged={onPinChanged} />;
      default:
        return null;
    }
  };

  /* ═══════════════════════════════════
     MOBILE — Fullscreen banco digital (sem bottom nav)
     ═══════════════════════════════════ */
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)]">
        {/* Conteúdo scrollável */}
        <main className="flex-1 overflow-y-auto pt-[env(safe-area-inset-top)] pb-4">

          {/* Header inline */}
          <div className="flex items-center justify-between px-3 pt-5 pb-5">
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (subBackConfig && activeSection !== "overview") {
                    subBackConfig.action();
                  } else if (activeSection !== "overview") {
                    setActiveSection("overview");
                    setSubBackConfig(null);
                  } else if (onBack) {
                    onBack();
                  }
                }}
                className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 active:bg-secondary/60 transition-all cursor-pointer z-10"
                aria-label="Voltar"
                type="button"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-foreground pointer-events-none">
                  <path d="M9 14L4 9l5-5" />
                  <path d="M4 9h10a4 4 0 0 1 4 4v1" />
                </svg>
              </button>
              <p className="text-[15px] font-semibold text-foreground leading-none">
                {activeSection === "overview"
                  ? `Olá, ${userName?.split(" ")[0] || "Usuário"}`
                  : subBackConfig?.label || "Banco"}
              </p>
            </div>

            {/* Foto — canto direito */}
            <div className="w-8 h-8 rounded-full bg-foreground/[0.06] flex items-center justify-center overflow-hidden flex-shrink-0 ring-1 ring-border">
              {userPhoto ? (
                <img src={userPhoto} alt="" className="w-full h-full object-cover" />
              ) : (
                <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </div>
          </div>
          <div className="px-4 py-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </div>
      </main>
      </div>
    );
  }

  /* ═══════════════════════════════════
     DESKTOP — Sidebar + conteúdo
     ═══════════════════════════════════ */
  return (
    <div className="min-h-[calc(100vh-80px)]">
      {/* Header desktop — compacto com foto e nome */}
      <div className="flex items-center justify-between mb-6 -mt-1">
        <div className="flex items-center gap-3">
          {subBackConfig && activeSection !== "overview" ? (
            <button
              onClick={subBackConfig.action}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>{subBackConfig.label}</span>
            </button>
          ) : activeSection !== "overview" ? (
            <button
              onClick={() => { setActiveSection("overview"); setSubBackConfig(null); }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>Voltar ao banco</span>
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2.5">
          <div className="min-w-0 text-right">
            <p className="text-[13px] font-semibold text-foreground/85 leading-none truncate">
              {userName || "Financeiro"}
            </p>
            <p className="text-[10px] text-muted-foreground/50 leading-none mt-1">
              {role === "admin" ? "Conta Empresarial" : "Conta Pessoal"}
            </p>
          </div>
          <div className="w-9 h-9 rounded-full bg-foreground/[0.06] flex items-center justify-center overflow-hidden flex-shrink-0 ring-1 ring-border/30">
            {userPhoto ? (
              <img src={userPhoto} alt="" className="w-full h-full object-cover" />
            ) : (
              <Wallet className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeSection}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
