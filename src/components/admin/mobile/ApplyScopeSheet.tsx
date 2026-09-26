import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Check, User, Building2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Unidade {
  id: string;
  nome: string;
  is_sede: boolean;
}

export type ApplyScope =
  | { type: "self" }
  | { type: "units"; unitIds: string[] };

interface ApplyScopeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string | null;
  title?: string;
  description?: string;
  onConfirm: (scope: ApplyScope) => void;
}

/**
 * Sheet minimalista que pergunta se a alteração vale apenas para o
 * admin/barbeiro logado ou para uma ou mais barbearias (unidades) do tenant.
 * Padrão a ser reutilizado em toda configuração do app.
 */
export function ApplyScopeSheet({
  open,
  onOpenChange,
  tenantId,
  title = "Aplicar alteração a...",
  description = "Escolha se essa configuração vale só para você ou para toda a barbearia.",
  onConfirm,
}: ApplyScopeSheetProps) {
  const [mode, setMode] = useState<"self" | "units" | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setMode(null);
      setSelected(new Set());
      return;
    }
    if (!tenantId) return;
    setLoading(true);
    supabase
      .from("tenant_unidades")
      .select("id, nome, is_sede")
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .order("is_sede", { ascending: false })
      .order("nome")
      .then(({ data }) => {
        setUnidades(data || []);
        setLoading(false);
      });
  }, [open, tenantId]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    setSelected(new Set(unidades.map((u) => u.id)));
  };

  const clearAll = () => {
    setSelected(new Set());
  };

  const handleSelectMode = (newMode: "self" | "units") => {
    setMode(newMode);
    if (newMode === "units") {
      // Se tiver só 1 unidade ou nenhuma explícita, já seleciona direto
      if (unidades.length <= 1) {
        setSelected(new Set(unidades.map((u) => u.id)));
      } else {
        // Se tiver várias unidades, começa com todas selecionadas por padrão (comportamento "todas")
        setSelected(new Set(unidades.map((u) => u.id)));
      }
    }
  };

  const confirm = () => {
    if (mode === "self") {
      onConfirm({ type: "self" });
      onOpenChange(false);
      return;
    }
    if (mode === "units") {
      const ids = Array.from(selected);
      // Se não tem unidades explícitas no banco, passa array vazio para escopo geral
      onConfirm({ type: "units", unitIds: ids });
      onOpenChange(false);
    }
  };

  const canConfirm =
    mode === "self" || (mode === "units" && (unidades.length <= 1 || selected.size > 0));

  const allSelected = unidades.length > 1 && selected.size === unidades.length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl border-border/50 max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="text-[17px] font-semibold text-foreground">{title}</SheetTitle>
          <SheetDescription className="text-[12.5px] text-muted-foreground">
            {description}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-2.5">
          <button
            onClick={() => handleSelectMode("self")}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-left",
              mode === "self"
                ? "border-foreground bg-foreground/[0.04]"
                : "border-border/60 hover:bg-muted/40"
            )}
          >
            <div className="h-9 w-9 rounded-lg bg-muted/60 flex items-center justify-center">
              <User className="h-[18px] w-[18px] text-foreground" strokeWidth={1.7} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-foreground">Somente para mim</p>
              <p className="text-[11.5px] text-muted-foreground">Aplica só ao seu perfil de atendimento</p>
            </div>
            {mode === "self" && <Check className="h-4 w-4 text-foreground" />}
          </button>

          <button
            onClick={() => handleSelectMode("units")}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-left",
              mode === "units"
                ? "border-foreground bg-foreground/[0.04]"
                : "border-border/60 hover:bg-muted/40"
            )}
          >
            <div className="h-9 w-9 rounded-lg bg-muted/60 flex items-center justify-center">
              <Building2 className="h-[18px] w-[18px] text-foreground" strokeWidth={1.7} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-foreground">Toda a barbearia</p>
              <p className="text-[11.5px] text-muted-foreground">
                {unidades.length > 1
                  ? "Configurar uma ou todas as barbearias"
                  : "Horário geral de funcionamento da barbearia"}
              </p>
            </div>
            {mode === "units" && <Check className="h-4 w-4 text-foreground" />}
          </button>
        </div>

        {/* Só exibe seleção de barbearias SE HOUVER MAIS DE UMA UNIDADE */}
        {mode === "units" && unidades.length > 1 && (
          <div className="mt-4 border-t border-border/40 pt-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[11.5px] uppercase tracking-wide text-muted-foreground/80 font-semibold">
                Barbearias ({selected.size}/{unidades.length})
              </p>
              <button
                type="button"
                onClick={allSelected ? clearAll : selectAll}
                className="text-[11.5px] text-primary hover:underline font-medium"
              >
                {allSelected ? "Desmarcar todas" : "Selecionar todas"}
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {/* Opção Rápida: Aplicar a Todas de uma vez */}
                <button
                  type="button"
                  onClick={allSelected ? clearAll : selectAll}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all mb-2",
                    allSelected
                      ? "border-primary/60 bg-primary/5"
                      : "border-border/50 hover:bg-muted/40"
                  )}
                >
                  <div
                    className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                      allSelected ? "border-primary bg-primary" : "border-border"
                    )}
                  >
                    {allSelected && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13.5px] font-semibold text-foreground block">
                      Todas as barbearias
                    </span>
                    <span className="text-[11px] text-muted-foreground block">
                      Aplica as configurações para todas as unidades de uma vez
                    </span>
                  </div>
                </button>

                {/* Lista individual */}
                {unidades.map((u) => {
                  const on = selected.has(u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggle(u.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                        on ? "bg-foreground/[0.05]" : "hover:bg-muted/40"
                      )}
                    >
                      <div
                        className={cn(
                          "h-4 w-4 rounded border flex items-center justify-center flex-shrink-0",
                          on ? "border-foreground bg-foreground" : "border-border"
                        )}
                      >
                        {on && <Check className="h-3 w-3 text-background" strokeWidth={3} />}
                      </div>
                      <span className="text-[13px] text-foreground flex-1 truncate">
                        {u.nome}
                        {u.is_sede && (
                          <span className="ml-2 text-[10px] text-muted-foreground uppercase tracking-wide">
                            Sede
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <Button
          onClick={confirm}
          disabled={!canConfirm}
          className="w-full mt-6 h-11 rounded-xl bg-foreground text-background font-semibold hover:bg-foreground/90 disabled:opacity-40"
        >
          Continuar
        </Button>
      </SheetContent>
    </Sheet>
  );
}
