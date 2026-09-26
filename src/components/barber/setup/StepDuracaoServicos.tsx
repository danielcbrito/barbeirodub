import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Clock, Scissors } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Servico {
  id: string;
  nome: string;
  preco: number;
  duracao_minutos: number;
  ativo: boolean;
}

interface Props {
  barbeiroId: string;
  tenantId: string;
}

const SERVICE_COLORS = [
  "bg-violet-400", "bg-rose-400", "bg-amber-500", "bg-emerald-400",
  "bg-sky-400", "bg-orange-400", "bg-pink-400", "bg-teal-400",
];

const durationOptions = [
  { value: "5", label: "5min" },
  { value: "10", label: "10min" },
  { value: "15", label: "15min" },
  { value: "20", label: "20min" },
  { value: "25", label: "25min" },
  { value: "30", label: "30min" },
  { value: "35", label: "35min" },
  { value: "40", label: "40min" },
  { value: "45", label: "45min" },
  { value: "50", label: "50min" },
  { value: "55", label: "55min" },
  { value: "60", label: "1h" },
  { value: "65", label: "1h 5min" },
  { value: "70", label: "1h 10min" },
  { value: "75", label: "1h 15min" },
  { value: "80", label: "1h 20min" },
  { value: "85", label: "1h 25min" },
  { value: "90", label: "1h 30min" },
  { value: "95", label: "1h 35min" },
  { value: "100", label: "1h 40min" },
  { value: "105", label: "1h 45min" },
  { value: "110", label: "1h 50min" },
  { value: "115", label: "1h 55min" },
  { value: "120", label: "2h" },
];

function formatDuration(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

/**
 * Step — Personalizar duração dos serviços (para barbeiros convidados).
 * Exibe os serviços do tenant e permite ajustar o tempo de cada um.
 * Nome e preço são somente leitura.
 */
export function StepDuracaoServicos({ barbeiroId, tenantId }: Props) {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [customDurations, setCustomDurations] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [tenantId, barbeiroId]);

  const loadData = async () => {
    try {
      // Buscar serviços do tenant
      const { data: servicosData, error: sErr } = await supabase
        .from("servicos")
        .select("id, nome, preco, duracao_minutos, ativo")
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .order("nome");

      if (sErr) throw sErr;
      setServicos(servicosData || []);

      // Buscar durações personalizadas existentes
      const { data: duracoes } = await supabase
        .from("barbeiro_servico_duracao")
        .select("servico_id, duracao_personalizada")
        .eq("barbeiro_id", barbeiroId);

      const map: Record<string, number> = {};
      (duracoes || []).forEach((d) => {
        map[d.servico_id] = d.duracao_personalizada;
      });
      setCustomDurations(map);
    } catch (err) {
      console.error("Erro ao carregar serviços:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDurationChange = async (servicoId: string, minutes: number) => {
    setCustomDurations((prev) => ({ ...prev, [servicoId]: minutes }));

    try {
      // Upsert a duração personalizada
      const { error } = await supabase
        .from("barbeiro_servico_duracao")
        .upsert(
          {
            barbeiro_id: barbeiroId,
            servico_id: servicoId,
            duracao_personalizada: minutes,
          },
          { onConflict: "barbeiro_id,servico_id" }
        );

      if (error) throw error;
    } catch (err) {
      console.error("Erro ao salvar duração:", err);
      toast.error("Erro ao salvar duração");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 -mt-2">
      <div>
        <h2 className="text-[22px] font-semibold text-foreground leading-tight">
          Tempo por serviço
        </h2>
        <p className="text-[13px] text-foreground/90 mt-1">
          Quanto tempo você leva em cada serviço? Ajuste conforme seu ritmo.
        </p>
      </div>

      {servicos.length === 0 ? (
        <div className="text-center py-12">
          <Scissors className="w-10 h-10 mx-auto text-muted-foreground mb-3" strokeWidth={1.5} />
          <p className="text-[13px] text-muted-foreground">
            Nenhum serviço cadastrado pela barbearia ainda
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {servicos.map((servico, index) => {
            const currentDuration = customDurations[servico.id] ?? servico.duracao_minutos;
            const isCustom = customDurations[servico.id] !== undefined && customDurations[servico.id] !== servico.duracao_minutos;

            return (
              <div
                key={servico.id}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card/50 hover:bg-card transition-colors"
              >
                {/* Ícone colorido */}
                <div className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center text-foreground text-[14px] font-bold flex-shrink-0",
                  SERVICE_COLORS[index % SERVICE_COLORS.length]
                )}>
                  {servico.nome.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">
                    {servico.nome}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    R$ {servico.preco.toFixed(2)}
                    {isCustom && (
                      <span className="ml-1.5 text-primary font-medium">
                        • personalizado
                      </span>
                    )}
                  </p>
                </div>

                {/* Seletor de duração */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <Select
                    value={currentDuration.toString()}
                    onValueChange={(v) => handleDurationChange(servico.id, parseInt(v))}
                  >
                    <SelectTrigger className="h-8 w-[90px] text-[12px] font-medium bg-transparent border-border rounded-lg px-2.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {durationOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-[12px]">
                          {opt.label}
                          {parseInt(opt.value) === servico.duracao_minutos && (
                            <span className="ml-1 text-muted-foreground">(padrão)</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
