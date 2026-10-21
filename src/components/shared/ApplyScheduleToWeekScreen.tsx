import { Loader2, CheckCheck, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { motion } from 'framer-motion';

const DIAS_SEMANA = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado',
];

function CurvedBackArrow({ className }: { className?: string }) {
  return (
    <svg
      width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a4 4 0 0 1 4 4v1" />
    </svg>
  );
}

interface Props {
  horaAbertura: string;
  horaFechamento: string;
  horaAlmocoInicio: string | null;
  horaAlmocoFim: string | null;
  slotIntervalMinutes?: number | null;
  selectedDays: number[];
  onToggleDay: (dia: number) => void;
  onSetSelectedDays?: (days: number[]) => void;
  onSave: () => void | Promise<void>;
  onBack?: () => void;
  saving: boolean;
  floatingBottomButton?: boolean;
  existingDaySummaries?: Record<number, string>;
  title?: string;
  description?: string;
  hideBackArrow?: boolean;
}

export function ApplyScheduleToWeekScreen({
  horaAbertura,
  horaFechamento,
  horaAlmocoInicio,
  horaAlmocoFim,
  slotIntervalMinutes,
  selectedDays,
  onToggleDay,
  onSetSelectedDays,
  onSave,
  onBack,
  saving,
  floatingBottomButton = false,
  existingDaySummaries,
  title = "Aplicar aos dias da semana",
  description = "Selecione os dias em que deseja aplicar esta configuração de horários. Os dias não marcados permanecerão inalterados.",
  hideBackArrow = false,
}: Props) {
  const resumo = `${horaAbertura} - ${horaFechamento}`;
  const almocoResumo = horaAlmocoInicio && horaAlmocoFim
    ? `Almoço ${horaAlmocoInicio} - ${horaAlmocoFim}`
    : 'Sem almoço';
  const slotResumo = slotIntervalMinutes ? `Intervalo: ${slotIntervalMinutes} min` : null;

  const allSelected = selectedDays.length === 7;
  const weekdaysSelected = [1, 2, 3, 4, 5].every((d) => selectedDays.includes(d)) && selectedDays.length === 5;

  const handleSelectAll = () => {
    if (onSetSelectedDays) {
      onSetSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    } else {
      for (let i = 0; i <= 6; i++) {
        if (!selectedDays.includes(i)) onToggleDay(i);
      }
    }
  };

  const handleDeselectAll = () => {
    if (onSetSelectedDays) {
      onSetSelectedDays([]);
    } else {
      for (let i = 0; i <= 6; i++) {
        if (selectedDays.includes(i)) onToggleDay(i);
      }
    }
  };

  const handleSelectWeekdays = () => {
    if (onSetSelectedDays) {
      onSetSelectedDays([1, 2, 3, 4, 5]);
    } else {
      [0, 1, 2, 3, 4, 5, 6].forEach((d) => {
        const isWeekday = d >= 1 && d <= 5;
        const isSelected = selectedDays.includes(d);
        if (isWeekday && !isSelected) onToggleDay(d);
        if (!isWeekday && isSelected) onToggleDay(d);
      });
    }
  };

  const handleSelectWeekend = () => {
    if (onSetSelectedDays) {
      onSetSelectedDays([0, 6]);
    } else {
      [0, 1, 2, 3, 4, 5, 6].forEach((d) => {
        const isWeekend = d === 0 || d === 6;
        const isSelected = selectedDays.includes(d);
        if (isWeekend && !isSelected) onToggleDay(d);
        if (!isWeekend && isSelected) onToggleDay(d);
      });
    }
  };

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="flex min-h-[calc(100dvh-156px)] flex-col pb-24"
    >
      <div className="flex items-center gap-2 pt-1.5 min-h-[48px]">
        {onBack && !hideBackArrow && (
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all -ml-1 shrink-0"
            aria-label="Voltar"
          >
            <CurvedBackArrow className="text-foreground" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-[20px] font-semibold text-foreground tracking-tight leading-tight truncate">
            {title}
          </h2>
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground/70 mt-1 leading-relaxed">
        {description}
      </p>

      {/* Resumo da configuração que será aplicada */}
      <div className="mt-3.5 rounded-2xl border border-primary/20 bg-primary/5 p-3.5 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">
            Horário a aplicar
          </span>
          <span className="text-[11px] font-medium text-foreground bg-background/80 px-2 py-0.5 rounded-md border border-border/30">
            {selectedDays.length} {selectedDays.length === 1 ? 'dia selecionado' : 'dias selecionados'}
          </span>
        </div>
        <p className="text-[15px] font-bold text-foreground tracking-tight">{resumo}</p>
        <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground/80 pt-0.5">
          <span>{almocoResumo}</span>
          {slotResumo && (
            <>
              <span>•</span>
              <span>{slotResumo}</span>
            </>
          )}
        </div>
      </div>

      {/* Ações de seleção rápida (1 clique) */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          {/* Botão de seleção rápida principal: Selecionar toda a semana / Desmarcar todos */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={allSelected ? handleDeselectAll : handleSelectAll}
            className="flex-1 h-9 rounded-xl text-xs font-semibold border-foreground/20 hover:bg-foreground/5 active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            {allSelected ? (
              <>
                <X className="h-3.5 w-3.5 text-muted-foreground" />
                Desmarcar todos
              </>
            ) : (
              <>
                <CheckCheck className="h-3.5 w-3.5 text-primary" />
                Selecionar semana inteira (7 dias)
              </>
            )}
          </Button>
        </div>

        {/* Filtros em pílulas */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={handleSelectAll}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all shrink-0 flex items-center gap-1.5 border ${
              allSelected
                ? 'bg-foreground text-background border-foreground font-semibold shadow-xs'
                : 'bg-muted/15 text-muted-foreground border-border/30 hover:border-border/60 hover:text-foreground'
            }`}
          >
            {allSelected && <Check className="h-3 w-3 stroke-[2.5]" />}
            Todos os 7 dias
          </button>

          <button
            type="button"
            onClick={handleSelectWeekdays}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all shrink-0 flex items-center gap-1.5 border ${
              weekdaysSelected
                ? 'bg-foreground text-background border-foreground font-semibold shadow-xs'
                : 'bg-muted/15 text-muted-foreground border-border/30 hover:border-border/60 hover:text-foreground'
            }`}
          >
            {weekdaysSelected && <Check className="h-3 w-3 stroke-[2.5]" />}
            Segunda a Sexta (5 dias)
          </button>

          <button
            type="button"
            onClick={handleSelectWeekend}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all shrink-0 flex items-center gap-1.5 border ${
              selectedDays.length === 2 && selectedDays.includes(0) && selectedDays.includes(6)
                ? 'bg-foreground text-background border-foreground font-semibold shadow-xs'
                : 'bg-muted/15 text-muted-foreground border-border/30 hover:border-border/60 hover:text-foreground'
            }`}
          >
            {selectedDays.length === 2 && selectedDays.includes(0) && selectedDays.includes(6) && (
              <Check className="h-3 w-3 stroke-[2.5]" />
            )}
            Fim de semana (Sáb/Dom)
          </button>
        </div>
      </div>

      {/* Lista de dias da semana */}
      <div className="mt-3 divide-y divide-border/10 rounded-2xl border border-border/25 bg-background px-3">
        {DIAS_SEMANA.map((label, dia) => {
          const checked = selectedDays.includes(dia);
          const currentSummary = existingDaySummaries?.[dia];

          return (
            <button
              key={dia}
              type="button"
              onClick={() => onToggleDay(dia)}
              className="flex items-center justify-between w-full py-3.5 text-left active:bg-muted/10 transition-colors"
            >
              <div className="flex-1 pr-3">
                <div className="flex items-center gap-2">
                  <p className={`text-[14px] font-semibold ${checked ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                    {label}
                  </p>
                  {checked && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      Aplicar
                    </span>
                  )}
                </div>
                <p className={`text-[12px] mt-0.5 ${checked ? 'text-foreground/80 font-medium' : 'text-muted-foreground/40'}`}>
                  {checked
                    ? resumo
                    : currentSummary
                      ? `Mantém: ${currentSummary}`
                      : 'Não será alterado'}
                </p>
              </div>
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggleDay(dia)}
                className="h-5 w-5 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
              />
            </button>
          );
        })}
      </div>

      {/* Botão de salvar no rodapé */}
      <div
        className={floatingBottomButton
          ? "fixed inset-x-0 bottom-0 z-50 px-6 pt-5 pb-[calc(18px+env(safe-area-inset-bottom))] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 max-w-md mx-auto"
          : "sticky bottom-0 z-30 mt-auto pt-5 pb-[calc(18px+env(safe-area-inset-bottom))] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85"
        }
      >
        <Button
          onClick={onSave}
          disabled={saving || selectedDays.length === 0}
          className="w-full h-[48px] rounded-xl bg-foreground hover:bg-foreground/90 text-background font-semibold text-sm shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Salvando alterações...
            </>
          ) : selectedDays.length === 0 ? (
            'Selecione pelo menos 1 dia'
          ) : selectedDays.length === 7 ? (
            'Aplicar a toda a semana (7 dias)'
          ) : (
            `Aplicar aos ${selectedDays.length} dias selecionados`
          )}
        </Button>
      </div>
    </motion.div>
  );
}
