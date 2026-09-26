import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Ticket, Lock, Calendar, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface BarberCuponsAtivosProps {
  tenantId: string | null | undefined;
}

interface CupomRow {
  id: string;
  codigo: string;
  tipo_desconto: string;
  valor_desconto: number;
  escopo: string | null;
  descricao: string | null;
  valido_ate: string | null;
  uso_obrigatorio: boolean | null;
}

/**
 * Tela read-only de cupons ativos da barbearia.
 *
 * O barbeiro NUNCA cria/edita/exclui cupons — isso é feito pelo dono/admin
 * no painel DUB. Esta tela é apenas informativa para que o barbeiro saiba
 * quais códigos pode mencionar/aplicar no atendimento.
 */
export function BarberCuponsAtivos({ tenantId }: BarberCuponsAtivosProps) {
  const { data: cupons, isLoading, error } = useQuery({
    queryKey: ["barber", "cupons-ativos", tenantId],
    queryFn: async () => {
      if (!tenantId) return [] as CupomRow[];
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("cupons" as any)
        .select(
          "id, codigo, tipo_desconto, valor_desconto, escopo, descricao, valido_ate, uso_obrigatorio"
        )
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .or(`valido_ate.is.null,valido_ate.gt.${nowIso}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as CupomRow[];
    },
    enabled: !!tenantId,
    staleTime: 60 * 1000,
  });

  return (
    <div className="max-w-3xl mx-auto py-2">
      <header className="px-1 mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-foreground/[0.06] flex items-center justify-center">
            <Ticket className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              Cupons ativos
            </h1>
            <p className="text-xs text-muted-foreground">
              Códigos válidos da barbearia. Apenas leitura.
            </p>
          </div>
        </div>
      </header>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Carregando cupons…</span>
        </div>
      )}

      {error && (
        <div className="px-5 py-4 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive text-sm">
          Erro ao carregar cupons.
        </div>
      )}

      {!isLoading && !error && cupons && cupons.length === 0 && (
        <div className="px-5 py-12 rounded-xl bg-card border border-border text-center">
          <Ticket className="w-8 h-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm font-medium text-foreground">Nenhum cupom ativo</p>
          <p className="text-xs text-muted-foreground mt-1">
            Quando o administrador criar cupons, eles aparecerão aqui.
          </p>
        </div>
      )}

      {!isLoading && !error && cupons && cupons.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {cupons.map((c) => (
            <CupomCard key={c.id} cupom={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CupomCard({ cupom }: { cupom: CupomRow }) {
  const isPercent = cupom.tipo_desconto === "percentual";
  const descontoLabel = isPercent
    ? `${Number(cupom.valor_desconto).toFixed(0)}%`
    : `R$ ${Number(cupom.valor_desconto).toFixed(2).replace(".", ",")}`;

  const isPrivado = cupom.escopo === "privado";
  const validade = cupom.valido_ate
    ? format(parseISO(cupom.valido_ate), "dd 'de' MMM yyyy", { locale: ptBR })
    : "Sem validade";

  return (
    <div
      className={cn(
        "relative rounded-xl bg-card border border-border overflow-hidden",
        "px-5 py-4 transition-colors hover:border-foreground/20"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">
            Código
          </p>
          <p className="font-mono font-bold text-foreground text-base tracking-wider truncate">
            {cupom.codigo}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge
            variant="outline"
            className="border-primary/30 text-primary bg-primary/10 font-mono"
          >
            -{descontoLabel}
          </Badge>
          {isPrivado && (
            <Badge
              variant="outline"
              className="border-amber-500/30 text-amber-500 bg-amber-500/10 text-[10px]"
            >
              <Lock className="w-3 h-3 mr-1" />
              PRIVADO
            </Badge>
          )}
        </div>
      </div>

      {cupom.descricao && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
          {cupom.descricao}
        </p>
      )}

      <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
        <Calendar className="w-3.5 h-3.5" />
        <span>Válido até: {validade}</span>
        {cupom.uso_obrigatorio && (
          <Badge variant="outline" className="ml-auto text-[10px]">
            Obrigatório
          </Badge>
        )}
      </div>
    </div>
  );
}
