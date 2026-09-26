import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Ban,
  Shield,
  Building2,
  Globe,
  Loader2,
  X,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BarberClient } from "@/hooks/useBarberClientes";

/* ─── Types ─── */
type BlockScope = "barber" | "unit" | "tenant";

interface BlockClientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: BarberClient | null;
  tenantId: string | null;
  barbeiroId: string;
  blockedByUserId: string;
  canManageTenantWide: boolean;
  onConfirm: (params: {
    scope: BlockScope;
    unidadesIds?: string[];
    motivo?: string;
  }) => void;
  isPending: boolean;
}

/* ─── Scope option card ─── */
function ScopeOption({
  selected,
  onSelect,
  icon: Icon,
  title,
  description,
  warning,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ElementType;
  title: string;
  description: string;
  warning?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-2xl border p-4 transition-all duration-200",
        selected
          ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
          : "border-border/40 bg-secondary/20 hover:bg-secondary/30"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Radio indicator */}
        <div
          className={cn(
            "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            selected
              ? "border-primary bg-primary"
              : "border-muted-foreground/30"
          )}
        >
          {selected && (
            <div className="h-2 w-2 rounded-full bg-primary-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Icon
              className={cn(
                "h-4 w-4 flex-shrink-0",
                selected ? "text-primary" : "text-muted-foreground"
              )}
            />
            <span
              className={cn(
                "text-sm font-semibold",
                selected ? "text-foreground" : "text-foreground/80"
              )}
            >
              {title}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
          {warning && selected && (
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-amber-500 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              {warning}
            </div>
          )}
        </div>
      </div>

      {/* Collapsible children (unit checkboxes) */}
      {selected && children && (
        <div className="mt-3 ml-8 space-y-2">{children}</div>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════ */
/*        BLOCK CLIENT MODAL              */
/* ═══════════════════════════════════════ */
export function BlockClientModal({
  open,
  onOpenChange,
  client,
  tenantId,
  canManageTenantWide,
  onConfirm,
  isPending,
}: BlockClientModalProps) {
  const [scope, setScope] = useState<BlockScope>("barber");
  const [unidadesSelecionadas, setUnidadesSelecionadas] = useState<string[]>(
    []
  );
  const [motivo, setMotivo] = useState("");

  /* Reset state when modal opens */
  useEffect(() => {
    if (open) {
      setScope("barber");
      setUnidadesSelecionadas([]);
      setMotivo("");
    }
  }, [open]);

  /* ── Buscar unidades do tenant ── */
  const { data: unidades } = useQuery({
    queryKey: ["tenant-unidades-bloqueio", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("tenant_unidades")
        .select("id, nome, is_sede")
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .order("is_sede", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && canManageTenantWide && open,
    staleTime: 5 * 60 * 1000,
  });

  const temMultiplasUnidades = (unidades?.length ?? 0) > 1;

  /* ── Toggle unidade checkbox ── */
  const toggleUnidade = (id: string) => {
    setUnidadesSelecionadas((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]
    );
  };

  /* ── Validação do botão ── */
  const isValid =
    scope !== "unit" || unidadesSelecionadas.length > 0;

  /* ── Submit ── */
  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm({
      scope,
      unidadesIds: scope === "unit" ? unidadesSelecionadas : undefined,
      motivo: motivo.trim() || undefined,
    });
  };

  if (!client) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[24rem] border-border/40 bg-background/70 p-0 shadow-2xl supports-[backdrop-filter]:bg-background/55"
      >
        <div className="relative overflow-hidden rounded-[inherit]">
          <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/0 to-background/10 pointer-events-none" />

          <div className="relative px-5 pt-5 pb-5">
            {/* ── Header ── */}
            <DialogHeader className="space-y-1 text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/50 bg-secondary/40">
                    <Ban className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <DialogTitle className="text-base font-semibold text-foreground">
                      Bloquear {client.nome.split(" ")[0]}
                    </DialogTitle>
                    <DialogDescription className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70 mt-0.5">
                      Escolha o nível de bloqueio
                    </DialogDescription>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50 bg-secondary/30 text-muted-foreground transition-all duration-200 hover:bg-secondary/50 hover:text-foreground"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </DialogHeader>

            {/* ── Scope options ── */}
            <div className="mt-5 space-y-2.5">
              {/* Opção 1: Apenas para mim */}
              <ScopeOption
                selected={scope === "barber"}
                onSelect={() => setScope("barber")}
                icon={Shield}
                title="Apenas para mim"
                description="Este cliente não verá mais seu perfil ao agendar"
              />

              {/* Opção 2: Por unidade (só dono + múltiplas unidades) */}
              {canManageTenantWide && temMultiplasUnidades && (
                <ScopeOption
                  selected={scope === "unit"}
                  onSelect={() => setScope("unit")}
                  icon={Building2}
                  title="Para uma ou mais unidades"
                  description="Selecione as unidades afetadas"
                >
                  <div className="space-y-1.5">
                    {unidades?.map((u) => (
                      <label
                        key={u.id}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors",
                          unidadesSelecionadas.includes(u.id)
                            ? "border-primary/30 bg-primary/5"
                            : "border-border/30 bg-secondary/10 hover:bg-secondary/20"
                        )}
                      >
                        <Checkbox
                          checked={unidadesSelecionadas.includes(u.id)}
                          onCheckedChange={() => toggleUnidade(u.id)}
                          className="h-4 w-4"
                        />
                        <span className="text-[13px] font-medium text-foreground">
                          {u.nome}
                        </span>
                        {u.is_sede && (
                          <span className="ml-auto text-[10px] font-medium text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded-md">
                            Sede
                          </span>
                        )}
                      </label>
                    ))}
                    {unidadesSelecionadas.length === 0 && (
                      <p className="text-[11px] text-amber-500 font-medium pl-1">
                        Selecione pelo menos uma unidade
                      </p>
                    )}
                  </div>
                </ScopeOption>
              )}

              {/* Opção 3: Toda a barbearia (só dono) */}
              {canManageTenantWide && (
                <ScopeOption
                  selected={scope === "tenant"}
                  onSelect={() => setScope("tenant")}
                  icon={Globe}
                  title="Para toda a barbearia"
                  description="Cliente não verá a barbearia em nenhuma circunstância"
                  warning="Ação mais restritiva"
                />
              )}
            </div>

            {/* ── Motivo (opcional) ── */}
            <div className="mt-4">
              <label className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
                Motivo (opcional)
              </label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: Comportamento inadequado, faltou 3x consecutivas..."
                className="h-16 resize-none text-[13px] rounded-xl border-border/40 bg-secondary/20 focus:bg-secondary/30"
                maxLength={200}
              />
            </div>

            {/* ── Actions ── */}
            <div className="mt-5 flex gap-2.5">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                className="flex-1 h-11 rounded-2xl text-[13px] font-medium"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isPending || !isValid}
                variant="destructive"
                className="flex-1 h-11 rounded-2xl text-[13px] font-semibold shadow-lg shadow-destructive/20"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Bloqueando...
                  </>
                ) : (
                  "Confirmar bloqueio"
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
