/**
 * ═══════════════════════════════════════════════════════════
 * CreateManualSubscriptionDialog
 * ═══════════════════════════════════════════════════════════
 *
 * Diálogo para o admin/barbeiro adicionar manualmente um plano
 * a um cliente já cadastrado. Usado quando o pagamento foi feito
 * fora do app (dinheiro, cartão de crédito presencial, PIX externo).
 *
 * As próximas renovações serão cobradas automaticamente pelo app
 * do cliente (não há recorrência manual).
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search, User, Crown, CreditCard, Calendar, X, Check } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

/* ─── Types ─────────────────────────────────────────────── */

interface ClienteResultado {
  id: string;
  nome: string;
  telefone: string | null;
}

interface PlanoOption {
  id: string;
  nome: string;
  preco_mensal: number;
  limite_agendamentos_mes: number | null;
}

interface BarbeiroOption {
  id: string;
  apelido: string;
}

interface CreateManualSubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string | null;
  /** Quando passado, trava o barbeiro vinculado (perfil de barbeiro logado) */
  lockedBarbeiroId?: string | null;
  onCreated?: () => void;
}

const FORMAS_PAGAMENTO = [
  { value: "cash", label: "Dinheiro" },
  { value: "credit_card", label: "Cartão de Crédito" },
  { value: "debit_card", label: "Cartão de Débito" },
  { value: "pix", label: "PIX (externo)" },
] as const;

/* ─── Component ─────────────────────────────────────────── */

export function CreateManualSubscriptionDialog({
  open,
  onOpenChange,
  tenantId,
  lockedBarbeiroId = null,
  onCreated,
}: CreateManualSubscriptionDialogProps) {
  const queryClient = useQueryClient();

  /* ── Form state ── */
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClienteResultado | null>(null);
  const [planoId, setPlanoId] = useState("");
  const [barbeiroId, setBarbeiroId] = useState<string>(lockedBarbeiroId || "");
  const [formaPagamento, setFormaPagamento] = useState<string>("cash");
  const [dataInicio, setDataInicio] = useState(() =>
    format(new Date(), "yyyy-MM-dd")
  );
  const [submitting, setSubmitting] = useState(false);

  /* ── Reset on open/close ── */
  useEffect(() => {
    if (!open) {
      setSearch("");
      setDebouncedSearch("");
      setSelectedClient(null);
      setPlanoId("");
      setBarbeiroId(lockedBarbeiroId || "");
      setFormaPagamento("cash");
      setDataInicio(format(new Date(), "yyyy-MM-dd"));
    } else {
      setBarbeiroId(lockedBarbeiroId || "");
    }
  }, [open, lockedBarbeiroId]);

  /* ── Debounce search ── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  /* ── Buscar clientes do tenant ── */
  const { data: clientes = [], isLoading: loadingClientes } = useQuery({
    queryKey: ["manual-sub", "clientes", tenantId, debouncedSearch],
    enabled: open && debouncedSearch.length >= 2 && !selectedClient,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, telefone")
        .or(`nome.ilike.%${debouncedSearch}%,telefone.ilike.%${debouncedSearch}%`)
        .limit(20);

      if (error) throw error;
      return (data || []) as ClienteResultado[];
    },
  });

  /* ── Buscar planos do tenant ── */
  const { data: planos = [] } = useQuery({
    queryKey: ["manual-sub", "planos", tenantId],
    enabled: open,
    queryFn: async () => {
      let query = supabase
        .from("planos")
        .select("id, nome, preco_mensal, limite_agendamentos_mes")
        .eq("ativo", true)
        .order("preco_mensal", { ascending: true });
      if (tenantId) query = query.eq("tenant_id", tenantId);
      else query = query.is("tenant_id", null);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as PlanoOption[];
    },
  });

  /* ── Buscar barbeiros do tenant (se não estiver travado) ── */
  const { data: barbeiros = [] } = useQuery({
    queryKey: ["manual-sub", "barbeiros", tenantId],
    enabled: open && !lockedBarbeiroId,
    queryFn: async () => {
      let query = supabase
        .from("barbeiros")
        .select("id, apelido")
        .eq("ativo", true)
        .is("deleted_at", null)
        .order("apelido");
      if (tenantId) query = query.eq("tenant_id", tenantId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as BarbeiroOption[];
    },
  });

  const planoSelecionado = useMemo(
    () => planos.find((p) => p.id === planoId),
    [planos, planoId]
  );

  const dataFim = useMemo(() => {
    if (!dataInicio) return null;
    return format(addDays(new Date(dataInicio + "T00:00:00"), 30), "yyyy-MM-dd");
  }, [dataInicio]);

  /* ── Submit ── */
  const handleSubmit = async () => {
    if (!selectedClient) return toast.error("Selecione um cliente");
    if (!planoId) return toast.error("Selecione um plano");
    if (!barbeiroId) return toast.error("Selecione um barbeiro vinculado");
    if (!dataInicio) return toast.error("Defina a data de início");

    setSubmitting(true);
    try {
      // Verificar se cliente já tem assinatura ativa
      const { data: existing } = await supabase
        .from("assinaturas")
        .select("id, status")
        .eq("user_id", selectedClient.id)
        .in("status", ["active", "pending_renewal", "pending_cash"])
        .maybeSingle();

      if (existing) {
        toast.error(
          "Este cliente já possui uma assinatura ativa. Cancele-a antes de criar uma nova."
        );
        setSubmitting(false);
        return;
      }

      const payload = {
        user_id: selectedClient.id,
        plano_id: planoId,
        barbeiro_id: barbeiroId,
        status: "active" as const,
        payment_method: formaPagamento as any,
        cash_payment_confirmed: true,
        ciclo_inicio: dataInicio,
        ciclo_fim: dataFim,
        next_billing_date: dataFim,
        usos_ciclo_atual: 0,
        total_renovacoes: 0,
        renovada_antecipadamente: false,
      };

      const { error: insertError } = await supabase
        .from("assinaturas")
        .insert(payload);

      if (insertError) throw insertError;

      // Notificar cliente
      await supabase.from("notificacoes").insert({
        user_id: selectedClient.id,
        titulo: "Plano ativado!",
        mensagem: `Seu plano ${planoSelecionado?.nome} foi ativado. Aproveite os benefícios!`,
        tipo: "plano_ativado",
      });

      toast.success(`Plano vinculado a ${selectedClient.nome}`);
      queryClient.invalidateQueries({ queryKey: ["admin", "assinaturas"] });
      onCreated?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error("[CreateManualSubscription] erro:", err);
      toast.error(err.message || "Erro ao criar assinatura");
    } finally {
      setSubmitting(false);
    }
  };

  const lockedBarbeiroNome = useMemo(() => {
    if (!lockedBarbeiroId) return null;
    return barbeiros.find((b) => b.id === lockedBarbeiroId)?.apelido || "Você";
  }, [lockedBarbeiroId, barbeiros]);

  /* ── Render ── */
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/30">
          <DialogTitle className="text-base flex items-center gap-2">
            <Crown className="w-4 h-4 text-primary" />
            Adicionar plano manualmente
          </DialogTitle>
          <DialogDescription className="text-xs">
            Vincule um plano a um cliente que pagou fora do app.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* ── 1. Cliente ── */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">
              Cliente
            </Label>

            {selectedClient ? (
              <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 px-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {selectedClient.nome}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {selectedClient.telefone || "—"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedClient(null)}
                  className="p-1 hover:bg-foreground/5 rounded-md"
                  aria-label="Trocar cliente"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
                  <Input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nome, telefone ou e-mail..."
                    className="h-9 pl-9 text-sm"
                  />
                </div>

                {debouncedSearch.length >= 2 && (
                  <div className="rounded-lg border border-border/40 max-h-48 overflow-y-auto">
                    {loadingClientes ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : clientes.length === 0 ? (
                      <p className="text-center text-xs text-muted-foreground py-4">
                        Nenhum cliente encontrado
                      </p>
                    ) : (
                      <ul className="divide-y divide-border/30">
                        {clientes.map((c) => (
                          <li key={c.id}>
                            <button
                              onClick={() => setSelectedClient(c)}
                              className="w-full text-left px-3 py-2 hover:bg-foreground/[0.03] transition-colors"
                            >
                              <p className="text-sm font-medium text-foreground truncate">
                                {c.nome}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {c.telefone || "—"}
                              </p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── 2. Plano ── */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">
              Plano
            </Label>
            <Select value={planoId} onValueChange={setPlanoId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Escolha o plano" />
              </SelectTrigger>
              <SelectContent>
                {planos.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    Nenhum plano disponível
                  </div>
                ) : (
                  planos.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-sm">
                      <div className="flex items-center justify-between gap-3 w-full">
                        <span>{p.nome}</span>
                        <span className="text-xs text-muted-foreground">
                          R$ {Number(p.preco_mensal).toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* ── 3. Barbeiro vinculado ── */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">
              Barbeiro vinculado
            </Label>
            {lockedBarbeiroId ? (
              <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2.5">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-sm text-foreground">
                  {lockedBarbeiroNome || "Você"}
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  Pré-selecionado
                </span>
              </div>
            ) : (
              <Select value={barbeiroId} onValueChange={setBarbeiroId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Escolha o barbeiro" />
                </SelectTrigger>
                <SelectContent>
                  {barbeiros.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="text-sm">
                      {b.apelido}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* ── 4. Forma de pagamento ── */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">
              Como o cliente pagou
            </Label>
            <Select value={formaPagamento} onValueChange={setFormaPagamento}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAS_PAGAMENTO.map((f) => (
                  <SelectItem key={f.value} value={f.value} className="text-sm">
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── 5. Início ── */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">
              Início do plano
            </Label>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="h-9 text-sm"
            />
            {dataFim && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pl-1">
                <Calendar className="w-3 h-3" />
                Encerra em{" "}
                {format(new Date(dataFim + "T00:00:00"), "dd 'de' MMMM", {
                  locale: ptBR,
                })}{" "}
                — renovação automática pelo app
              </p>
            )}
          </div>

          {/* Resumo */}
          {planoSelecionado && selectedClient && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-primary/80 font-semibold">
                Resumo
              </p>
              <p className="text-xs text-foreground">
                <span className="text-muted-foreground">Plano:</span>{" "}
                <span className="font-medium">{planoSelecionado.nome}</span> •{" "}
                <span className="font-medium">
                  R$ {Number(planoSelecionado.preco_mensal).toFixed(2).replace(".", ",")}
                </span>
              </p>
              <p className="text-xs text-foreground">
                <span className="text-muted-foreground">Cortes/mês:</span>{" "}
                <span className="font-medium">
                  {planoSelecionado.limite_agendamentos_mes ?? "Ilimitado"}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-border/30 bg-muted/10">
          <Button
            variant="ghost"
            className="flex-1 h-9 text-xs"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            className="flex-1 h-9 text-xs gap-1.5"
            onClick={handleSubmit}
            disabled={submitting || !selectedClient || !planoId || !barbeiroId}
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <CreditCard className="w-3.5 h-3.5" />
                Adicionar plano
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
