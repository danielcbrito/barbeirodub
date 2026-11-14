import { Loader2, ChevronLeft } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const DIAS_SEMANA = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado'
];

const OPTIONS = [5, 10, 15, 20, 30] as const;

interface SlotIntervalScreenProps {
  diaSemana: number;
  currentValue: number;
  saving: boolean;
  onBack: () => void;
  onConfirm: (minutos: number, aplicarTodosDias: boolean) => void | Promise<void>;
  floatingBottomButton?: boolean;
}

export function SlotIntervalScreen({
  diaSemana,
  currentValue,
  saving,
  onBack,
  onConfirm,
  floatingBottomButton = true,
}: SlotIntervalScreenProps) {
  const isPreset = OPTIONS.includes(currentValue as any);
  const [selected, setSelected] = useState<number>(isPreset ? currentValue : 15);
  const [custom, setCustom] = useState(isPreset ? false : true);
  const [customValue, setCustomValue] = useState<string>(isPreset ? '' : String(currentValue));
  const [aplicarTodos, setAplicarTodos] = useState(false);

  const parsedCustom = parseInt(customValue, 10);
  const customValid = !isNaN(parsedCustom) && parsedCustom >= 1 && parsedCustom <= 120;
  const finalValue = custom ? (customValid ? parsedCustom : NaN) : selected;
  const isValid = !isNaN(finalValue) && finalValue >= 1 && finalValue <= 120;

  return (
    <div
      className="mx-auto flex min-h-full w-full max-w-md flex-col px-4 sm:px-0 pb-28"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
    >
      <div className="flex items-center gap-2 min-h-[56px] py-1">
        <button
          type="button"
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-secondary/80 hover:bg-secondary active:scale-95 transition-all shrink-0 text-foreground flex items-center justify-center border border-border/30"
          aria-label="Voltar"
        >
          <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
        </button>

        <div className="flex-1 min-w-0">
          <h2 className="text-[20px] font-semibold text-foreground tracking-tight leading-none truncate">
            Intervalo de horários
          </h2>
          <p className="text-[12px] text-muted-foreground/70 mt-1 truncate">
            {DIAS_SEMANA[diaSemana]}
          </p>
        </div>
      </div>

      <div className="h-px bg-border/20 mt-2 mb-3" />

      <p className="text-[11px] text-muted-foreground/50 leading-relaxed font-light mt-3 mb-4">
        De quanto em quanto tempo os horários aparecem para o cliente. Escolha uma opção abaixo e confirme.
      </p>

      {/* Lista de opções (rádio) */}
      <div className="mb-6">
        <div className="h-px bg-border/15" />
        {OPTIONS.map((opt) => {
          const active = !custom && selected === opt;
          return (
            <div key={opt}>
              <button
                onClick={() => { setCustom(false); setSelected(opt); }}
                className="flex items-center gap-3 py-3.5 w-full text-left active:bg-muted/5 transition-colors"
              >
                <span
                  className={`h-[18px] w-[18px] rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                    active ? 'border-foreground' : 'border-border'
                  }`}
                >
                  {active && <span className="h-[9px] w-[9px] rounded-full bg-foreground" />}
                </span>
                <span className="text-[14px] text-foreground font-medium">{opt} min</span>
              </button>
              <div className="h-px bg-border/15" />
            </div>
          );
        })}

        {/* Personalizado */}
        <button
          onClick={() => setCustom(true)}
          className="flex items-center gap-3 py-3.5 w-full text-left active:bg-muted/5 transition-colors"
        >
          <span
            className={`h-[18px] w-[18px] rounded-full border flex items-center justify-center shrink-0 transition-colors ${
              custom ? 'border-foreground' : 'border-border'
            }`}
          >
            {custom && <span className="h-[9px] w-[9px] rounded-full bg-foreground" />}
          </span>
          <span className="text-[14px] text-foreground font-medium">Personalizado</span>
          {custom && (
            <span className="ml-auto flex items-center gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={120}
                autoFocus
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="00"
                className="w-[64px] h-9 rounded-lg bg-muted/40 text-center text-[14px] text-foreground outline-none focus:ring-1 focus:ring-foreground/30"
              />
              <span className="text-[12px] text-muted-foreground/60">min</span>
            </span>
          )}
        </button>
        <div className="h-px bg-border/15" />
      </div>

      <div className="h-px bg-border/20" />

      {/* Toggle aplicar a todos os dias */}
      <button
        onClick={() => setAplicarTodos((v) => !v)}
        className="flex items-center gap-3 py-4 w-full text-left active:bg-muted/5 transition-colors"
      >
        <div className="flex-1">
          <p className="text-[13px] text-foreground font-medium">
            Aplicar a todos os dias da semana
          </p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">
            Define o mesmo intervalo em todos os 7 dias
          </p>
        </div>
        <Switch
          checked={aplicarTodos}
          onCheckedChange={setAplicarTodos}
          className="scale-[0.85] data-[state=checked]:bg-emerald-500"
        />
      </button>

      <div className="h-px bg-border/20" />

      <div className="flex-1" />

      <div
        className={floatingBottomButton
          ? "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] bg-background/95 backdrop-blur-md border-t border-border/20 shadow-lg"
          : "sticky bottom-0 z-30 mt-auto w-full px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] bg-background/95 backdrop-blur-md border-t border-border/20"
        }
      >
        <Button
          onClick={() => onConfirm(finalValue, aplicarTodos)}
          disabled={saving || !isValid}
          className="w-full h-[50px] rounded-2xl bg-foreground hover:bg-foreground/90 text-background font-semibold text-base shadow-sm active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Salvando...
            </>
          ) : (
            'Confirmar'
          )}
        </Button>
      </div>
    </div>
  );
}
