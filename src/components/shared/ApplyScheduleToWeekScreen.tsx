import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { motion } from 'framer-motion';

const DIAS_SEMANA = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado',
];

interface Props {
  horaAbertura: string;
  horaFechamento: string;
  horaAlmocoInicio: string | null;
  horaAlmocoFim: string | null;
  selectedDays: number[];
  onToggleDay: (dia: number) => void;
  onSave: () => void;
  saving: boolean;
  floatingBottomButton?: boolean;
}

export function ApplyScheduleToWeekScreen({
  horaAbertura,
  horaFechamento,
  horaAlmocoInicio,
  horaAlmocoFim,
  selectedDays,
  onToggleDay,
  onSave,
  saving,
  floatingBottomButton = false,
}: Props) {
  const resumo = `${horaAbertura} - ${horaFechamento}`;
  const almocoResumo = horaAlmocoInicio && horaAlmocoFim
    ? `Almoço ${horaAlmocoInicio} - ${horaAlmocoFim}`
    : 'Sem intervalo';

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="flex min-h-[calc(100dvh-156px)] flex-col"
    >
      <div className="pt-1.5">
        <h2 className="text-[22px] font-semibold text-foreground tracking-tight leading-tight">
          Aplicar aos dias da semana
        </h2>
        <p className="text-[12px] text-muted-foreground/70 mt-2 leading-relaxed">
          Este horário será aplicado nos dias marcados. Desmarque os dias em que você não vai atender.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-border/30 bg-muted/10 px-4 py-3">
        <p className="text-[13px] font-semibold text-foreground">{resumo}</p>
        <p className="text-[11px] text-muted-foreground/60 mt-0.5">{almocoResumo}</p>
      </div>

      <div className="mt-4 divide-y divide-border/10">
        {DIAS_SEMANA.map((label, dia) => {
          const checked = selectedDays.includes(dia);
          return (
            <button
              key={dia}
              type="button"
              onClick={() => onToggleDay(dia)}
              className="flex items-center justify-between w-full py-4 text-left active:bg-muted/10 transition-colors"
            >
              <div className="flex-1">
                <p className={`text-[15px] font-semibold ${checked ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                  {label}
                </p>
                <p className={`text-[12px] mt-0.5 ${checked ? 'text-foreground/60' : 'text-muted-foreground/35'}`}>
                  {checked ? resumo : 'Fechado'}
                </p>
              </div>
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggleDay(dia)}
                className="h-5 w-5"
              />
            </button>
          );
        })}
      </div>

      <div
        className={floatingBottomButton
          ? "fixed inset-x-0 bottom-0 z-50 px-6 pt-5 pb-[calc(18px+env(safe-area-inset-bottom))] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90"
          : "sticky bottom-0 z-30 mt-auto pt-5 pb-[calc(18px+env(safe-area-inset-bottom))] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85"
        }
      >
        <Button
          onClick={onSave}
          disabled={saving || selectedDays.length === 0}
          className="w-full h-[48px] rounded-xl bg-foreground hover:bg-foreground/90 text-background font-semibold text-sm shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</>
          ) : (
            'Salvar'
          )}
        </Button>
      </div>
    </motion.div>
  );
}
