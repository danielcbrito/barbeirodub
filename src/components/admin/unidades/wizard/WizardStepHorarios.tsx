import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { AnimatePresence } from "framer-motion";
import { DayScheduleScreen } from "@/components/shared/DayScheduleScreen";

const DIAS_SEMANA = [
  "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
  "Quinta-feira", "Sexta-feira", "Sábado",
];

export interface DiaHorario {
  dia_semana: number;
  aberto: boolean;
  hora_abertura: string;
  hora_fechamento: string;
  hora_almoco_inicio: string | null;
  hora_almoco_fim: string | null;
}

export type UnidadeHorarios = DiaHorario[];

/** Retorna horários padrão (seg-sex 09-18, sáb 09-13, dom fechado) */
export function getDefaultHorarios(): UnidadeHorarios {
  return Array.from({ length: 7 }, (_, i) => ({
    dia_semana: i,
    aberto: i >= 1 && i <= 5,
    hora_abertura: "09:00",
    hora_fechamento: i === 6 ? "13:00" : "18:00",
    hora_almoco_inicio: "12:00",
    hora_almoco_fim: "13:00",
  }));
}

interface WizardStepHorariosProps {
  data: UnidadeHorarios;
  onChange: (data: UnidadeHorarios) => void;
  onSubScreenChange?: (isInSubScreen: boolean) => void;
  viewMode?: boolean;
}

/**
 * Step 3 — Horários de funcionamento.
 * Design IDÊNTICO ao AdminHorarios: lista de dias → DayScheduleScreen com TimeWheelPicker.
 */
export function WizardStepHorarios({ data, onChange, onSubScreenChange, viewMode = false }: WizardStepHorariosProps) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const updateField = (diaSemana: number, field: string, value: any) => {
    const updated = data.map((d) =>
      d.dia_semana === diaSemana ? { ...d, [field]: value } : d
    );
    onChange(updated);
  };

  const selectedConfig = selectedDay !== null ? data.find((d) => d.dia_semana === selectedDay) : null;

  /* ═══ Sub-tela: DayScheduleScreen com TimeWheelPicker ═══ */
  if (selectedConfig) {
    return (
      <div className="max-w-lg">
        <AnimatePresence mode="wait">
          <DayScheduleScreen
            key={selectedDay}
            config={selectedConfig}
            onBack={() => {
              setSelectedDay(null);
              onSubScreenChange?.(false);
            }}
            onUpdate={(field, value) => updateField(selectedConfig.dia_semana, field, value)}
            onSave={() => {}}
            saving={false}
            hasChanges={false}
          />
        </AnimatePresence>
      </div>
    );
  }

  /* ═══ Lista de dias — design idêntico ao AdminHorarios ═══ */
  return (
    <div className="space-y-4">
      {/* Título — hidden in viewMode */}
      {!viewMode && (
        <div>
          <h2 className="text-[22px] font-semibold text-foreground leading-tight">
            Horário de funcionamento
          </h2>
          <p className="text-[13px] text-foreground/90 mt-1">
            Quando os clientes podem agendar nesta unidade?
          </p>
        </div>
      )}

      {/* Lista de dias — idêntica ao AdminHorarios */}
      <div className="space-y-1">
        {data.map((config) => {
          const resumo = config.aberto
            ? `${config.hora_abertura?.slice(0, 5)} - ${config.hora_fechamento?.slice(0, 5)}`
            : "Fechado";

          return (
            <button
              key={config.dia_semana}
              onClick={() => {
                setSelectedDay(config.dia_semana);
                onSubScreenChange?.(true);
              }}
              className="flex items-center justify-between py-4 px-1 w-full text-left hover:bg-muted/5 active:bg-muted/10 transition-colors border-b border-border/10 last:border-b-0"
            >
              <span
                className={cn(
                  "text-[15px] font-semibold",
                  config.aberto ? "text-foreground" : "text-muted-foreground/50"
                )}
              >
                {DIAS_SEMANA[config.dia_semana]}
              </span>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "text-[15px] font-medium",
                    config.aberto ? "text-foreground/70" : "text-muted-foreground/35"
                  )}
                >
                  {resumo}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
