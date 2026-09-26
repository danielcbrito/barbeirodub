import { useEffect, useState } from "react";
import { Check, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";

/**
 * Configuração do "Intervalo de Horários para Agendamento" (por barbearia).
 * Persiste em public.tenants.slot_interval_minutes.
 * Impacta apenas a exibição dos horários disponíveis aos clientes.
 */
interface Props {
  tenantId?: string | null;
}

const OPTIONS: { value: number; label: string; hint?: string }[] = [
  { value: 5, label: "A cada 5 minutos", hint: "Padrão" },
  { value: 10, label: "A cada 10 minutos" },
  { value: 15, label: "A cada 15 minutos" },
  { value: 20, label: "A cada 20 minutos" },
  { value: 30, label: "A cada 30 minutos" },
];

export function BarberSlotIntervalConfig({ tenantId }: Props) {
  const [current, setCurrent] = useState<number>(5);
  const [selected, setSelected] = useState<number>(5);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!tenantId) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("tenants")
        .select("slot_interval_minutes")
        .eq("id", tenantId)
        .maybeSingle();
      if (!mounted) return;
      if (!error && data) {
        const v = (data as { slot_interval_minutes?: number }).slot_interval_minutes ?? 5;
        setCurrent(v);
        setSelected(v);
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [tenantId]);

  async function handleSave() {
    if (!tenantId || selected === current || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from("tenants")
      .update({ slot_interval_minutes: selected })
      .eq("id", tenantId);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar. Tente novamente.");
      return;
    }
    setCurrent(selected);
    toast.success(`Intervalo atualizado para ${selected} minutos.`);
  }

  const hasChange = selected !== current;

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="flex-1 overflow-hidden px-5 pt-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[17px] font-semibold text-foreground">
              Intervalo de Horários
            </h1>
            <p className="text-[12px] text-muted-foreground">
              De quanto em quanto tempo mostrar os horários.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-border/60 bg-card overflow-hidden">
          {loading ? (
            <div className="p-6 flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Carregando…
            </div>
          ) : (
            OPTIONS.map((opt, idx) => {
              const isSelected = selected === opt.value;
              return (
                <motion.button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelected(opt.value)}
                  whileTap={{ scale: 0.995 }}
                  className={`w-full flex items-center justify-between px-4 py-3.5 text-left active:opacity-80 transition-colors ${
                    idx > 0 ? "border-t border-border/40" : ""
                  } ${isSelected ? "bg-primary/5" : ""}`}
                >
                  <div className="min-w-0">
                    <div className="text-[15px] font-medium text-foreground">{opt.label}</div>
                    {opt.hint && (
                      <div className="text-[12px] text-muted-foreground mt-0.5">{opt.hint}</div>
                    )}
                  </div>
                  <div className="ml-3 shrink-0">
                    {isSelected ? (
                      <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                        <Check className="h-4 w-4" />
                      </div>
                    ) : (
                      <div className="h-6 w-6 rounded-full border-2 border-border" />
                    )}
                  </div>
                </motion.button>
              );
            })
          )}
        </div>
      </div>

      <div
        className="shrink-0 px-5 pt-3 border-t border-border/40 bg-background"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChange || saving || loading}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-[15px] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] transition-transform flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {hasChange ? "Mudar intervalo de horário" : "Intervalo atual salvo"}
        </button>
      </div>
    </div>
  );
}

export default BarberSlotIntervalConfig;
