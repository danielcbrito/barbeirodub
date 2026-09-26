/**
 * ═══════════════════════════════════════════════════════════
 * AgendaContext — Estado compartilhado do sistema de agenda
 * ═══════════════════════════════════════════════════════════
 *
 * Provider que centraliza:
 *  - View ativa (day/week/month)
 *  - Data selecionada
 *  - Modo de operação (admin/barber/readonly)
 *  - IDs contextuais (barbeiroId, tenantId)
 *
 * Uso:
 *   <AgendaProvider mode="admin" barbeiroId="...">
 *     <AgendaRoot />
 *   </AgendaProvider>
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { AgendaView, AgendaMode } from "./types";

interface AgendaContextValue {
  /** View ativa: day, week ou month */
  view: AgendaView;
  /** Altera a view ativa */
  setView: (v: AgendaView) => void;
  /** Modo: admin (gestão total), barber (própria agenda), readonly (público) */
  mode: AgendaMode;
  /** Data selecionada no calendário */
  selectedDate: Date;
  /** Altera a data selecionada */
  setSelectedDate: (d: Date) => void;
  /** ID do barbeiro cujos agendamentos exibir */
  barbeiroId: string | null;
  /** ID do tenant (para multi-tenant) */
  tenantId: string | null;
}

const AgendaContext = createContext<AgendaContextValue | null>(null);

interface AgendaProviderProps {
  children: ReactNode;
  mode: AgendaMode;
  initialView?: AgendaView;
  initialDate?: Date;
  barbeiroId?: string | null;
  tenantId?: string | null;
}

export function AgendaProvider({
  children,
  mode,
  initialView = "day",
  initialDate,
  barbeiroId = null,
  tenantId = null,
}: AgendaProviderProps) {
  const [view, setView] = useState<AgendaView>(initialView);
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate ?? new Date());

  return (
    <AgendaContext.Provider
      value={{
        view,
        setView,
        mode,
        selectedDate,
        setSelectedDate,
        barbeiroId,
        tenantId,
      }}
    >
      {children}
    </AgendaContext.Provider>
  );
}

/**
 * Hook para consumir o contexto da agenda.
 * Deve ser usado dentro de um AgendaProvider.
 */
export function useAgenda(): AgendaContextValue {
  const ctx = useContext(AgendaContext);
  if (!ctx) {
    throw new Error("useAgenda deve ser usado dentro de <AgendaProvider>");
  }
  return ctx;
}
