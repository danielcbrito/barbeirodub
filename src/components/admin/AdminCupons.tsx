import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Ticket, Calendar, Percent, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";
import {
  useCreateCupom,
  useUpdateCupom,
  useToggleCupom,
  useDeleteCupom,
} from "@/hooks/useAdminMutations";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";

interface Cupom {
  id: string;
  code: string;
  nome: string | null;
  percent: number;
  active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
}

/** Formulário compacto para criar/editar cupom */
function CouponForm({
  values,
  onChange,
  onSubmit,
  submitLabel,
  loading,
}: {
  values: { nome: string; code: string; percent: number; starts_at: string; expires_at: string };
  onChange: (v: typeof values) => void;
  onSubmit: () => void;
  submitLabel: string;
  loading: boolean;
}) {
  const isMobile = useIsMobile();

  return (
    <div className={isMobile ? "space-y-3" : "space-y-5"}>
      <div>
        <Label className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
          Nome
        </Label>
        <Input
          value={values.nome}
          onChange={(e) => onChange({ ...values, nome: e.target.value })}
          placeholder="Ex: Desconto de Verão"
          className={isMobile ? "h-8 text-[12px] mt-1" : "input-premium mt-2"}
        />
      </div>

      <div>
        <Label className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
          Código
        </Label>
        <Input
          value={values.code}
          onChange={(e) => onChange({ ...values, code: e.target.value.toUpperCase() })}
          placeholder="Ex: VERAO20"
          className={isMobile ? "h-8 text-[12px] mt-1 uppercase tracking-widest font-mono" : "input-premium mt-2 uppercase tracking-widest font-mono"}
        />
      </div>

      <div>
        <Label className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
          Desconto (%)
        </Label>
        <div className={`flex gap-1.5 ${isMobile ? "mt-1.5" : "mt-2"}`}>
          {[10, 15, 20, 25, 30].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange({ ...values, percent: p })}
              className={`flex-1 ${isMobile ? "py-1.5 rounded-lg text-[11px]" : "py-2.5 rounded-xl text-sm"} font-bold transition-all duration-200 border ${
                values.percent === p
                  ? "bg-foreground/10 border-foreground text-foreground shadow-sm"
                  : "bg-secondary/30 border-border/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              }`}
            >
              {p}%
            </button>
          ))}
        </div>
        <Input
          type="number"
          min={1}
          max={100}
          value={values.percent}
          onChange={(e) => onChange({ ...values, percent: Number(e.target.value) })}
          className={isMobile ? "h-8 text-[12px] mt-1.5" : "input-premium mt-2"}
          placeholder="Valor personalizado"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
            Início
          </Label>
          <Input
            type="date"
            value={values.starts_at}
            onChange={(e) => onChange({ ...values, starts_at: e.target.value })}
            className={isMobile ? "h-8 text-[11px] mt-1" : "input-premium mt-2"}
          />
        </div>
        <div>
          <Label className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
            Término
          </Label>
          <Input
            type="date"
            value={values.expires_at}
            onChange={(e) => onChange({ ...values, expires_at: e.target.value })}
            className={isMobile ? "h-8 text-[11px] mt-1" : "input-premium mt-2"}
          />
        </div>
      </div>

      <Button
        onClick={onSubmit}
        disabled={loading || !values.code.trim() || !values.nome.trim()}
        className={`w-full gap-2 font-semibold tracking-wide bg-foreground text-background hover:bg-foreground/90 ${isMobile ? "h-9 text-[12px]" : "h-12 text-base font-bold"}`}
      >
        {submitLabel}
      </Button>
    </div>
  );
}

interface AdminCuponsProps {
  tenantId?: string;
}

export function AdminCupons({ tenantId }: AdminCuponsProps = {}) {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const emptyForm = { nome: "", code: "", percent: 10, starts_at: "", expires_at: "" };
  const [form, setForm] = useState(emptyForm);

  const queryKey = QUERY_KEYS.admin.cupons(tenantId ?? null);

  // Mutation hooks
  const createMutation = useCreateCupom(tenantId ?? null);
  const updateMutation = useUpdateCupom(tenantId ?? null);
  const toggleMutation = useToggleCupom(tenantId ?? null);
  const deleteMutation = useDeleteCupom(tenantId ?? null);

  // useQuery for cupons
  const { data: cupons = [], isLoading: loading } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from("discount_coupons")
        .select("id, code, nome, percent, active, starts_at, expires_at, created_at")
        .order("created_at", { ascending: false });
      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      } else {
        query = query.is("tenant_id", null);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Cupom[];
    },
    staleTime: STALE_TIMES.SERVICOS,
  });

  // Realtime invalidation
  useEffect(() => {
    const channel = supabase
      .channel(`admin-cupons-${tenantId || 'global'}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "discount_coupons",
        ...(tenantId ? { filter: `tenant_id=eq.${tenantId}` } : {}),
      }, () => queryClient.invalidateQueries({ queryKey }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, queryClient, queryKey]);

  const handleCreate = () => {
    if (!form.code.trim() || !form.nome.trim()) return;
    const insertPayload: Record<string, unknown> = {
      code: form.code.trim().toUpperCase(),
      nome: form.nome.trim(),
      percent: form.percent,
      starts_at: form.starts_at || null,
      expires_at: form.expires_at || null,
    };
    if (tenantId) insertPayload.tenant_id = tenantId;

    createMutation.mutate(insertPayload, {
      onSuccess: () => {
        setCreateOpen(false);
        setForm(emptyForm);
      },
    });
  };

  const handleEdit = () => {
    if (!editingId || !form.code.trim() || !form.nome.trim()) return;

    updateMutation.mutate({
      id: editingId,
      payload: {
        code: form.code.trim().toUpperCase(),
        nome: form.nome.trim(),
        percent: form.percent,
        starts_at: form.starts_at || null,
        expires_at: form.expires_at || null,
      },
    }, {
      onSuccess: () => {
        setEditOpen(false);
        setEditingId(null);
      },
    });
  };

  const handleToggle = (id: string, current: boolean) => {
    toggleMutation.mutate({ id, active: current });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const openEdit = (c: Cupom) => {
    setEditingId(c.id);
    setForm({
      nome: c.nome || "",
      code: c.code,
      percent: c.percent,
      starts_at: c.starts_at ? c.starts_at.split("T")[0] : "",
      expires_at: c.expires_at ? c.expires_at.split("T")[0] : "",
    });
    setEditOpen(true);
  };

  const getCouponStatus = (c: Cupom) => {
    if (!c.active) return { label: "Inativo", className: "bg-secondary text-muted-foreground" };
    const now = new Date();
    if (c.expires_at && isBefore(parseISO(c.expires_at), now))
      return { label: "Expirado", className: "bg-orange-500/20 text-orange-400 border-orange-500/30" };
    if (c.starts_at && isAfter(parseISO(c.starts_at), now))
      return { label: "Agendado", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" };
    return { label: "Ativo", className: "bg-green-500/20 text-green-400 border-green-500/30" };
  };

  const filtered = cupons.filter(
    (c) =>
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      (c.nome || "").toLowerCase().includes(search.toLowerCase())
  );

  const activeCoupons = cupons.filter((c) => c.active).length;

  /* ─── Mobile: Full-page Create/Edit ─── */
  if (isMobile && (createOpen || editOpen)) {
    const pageTitle = editOpen ? "Editar Cupom" : "Novo Cupom";
    const handleSubmit = editOpen ? handleEdit : handleCreate;

    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <ScheduleHeader
          title={pageTitle}
          onBack={() => {
            setCreateOpen(false);
            setEditOpen(false);
            setEditingId(null);
            setForm(emptyForm);
          }}
        />

        {/* Formulário full-page */}
        <div className="flex-1 overflow-y-auto px-4 pt-5 pb-28 scrollbar-none">
          <div className="space-y-6">
            {/* Seção: Informações do cupom */}
            <div>
              <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-4 px-1">
                Informações do cupom
              </p>
              <div className="space-y-4">
                {/* Nome */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                    Nome do Cupom
                  </label>
                  <Input
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    placeholder="Ex: Desconto de Verão"
                    className="h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl px-4 placeholder:text-muted-foreground/30"
                  />
                </div>

                {/* Código */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                    Código
                  </label>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="Ex: VERAO20"
                    className="h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl px-4 placeholder:text-muted-foreground/30 uppercase tracking-widest font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Seção: Desconto */}
            <div>
              <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-4 px-1">
                Desconto
              </p>
              <div className="space-y-4">
                {/* Quick picks */}
                <div className="flex gap-2">
                  {[10, 15, 20, 25, 30].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setForm({ ...form, percent: p })}
                      className={cn(
                        "flex-1 py-2.5 rounded-xl text-[12.5px] font-semibold transition-all active:scale-95 border",
                        form.percent === p
                          ? "bg-foreground text-background border-foreground shadow-xs"
                          : "bg-secondary/40 border-border/60 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p}%
                    </button>
                  ))}
                </div>

                {/* Custom value */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                    Valor personalizado (%)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={form.percent}
                    onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })}
                    className="h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl px-4 placeholder:text-muted-foreground/30"
                    placeholder="Valor personalizado"
                  />
                </div>
              </div>
            </div>

            {/* Seção: Validade */}
            <div>
              <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-4 px-1">
                Validade (opcional)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                    Início
                  </label>
                  <Input
                    type="date"
                    value={form.starts_at}
                    onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                    className="h-12 text-[14px] bg-transparent border-border/40 rounded-xl px-4"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                    Término
                  </label>
                  <Input
                    type="date"
                    value={form.expires_at}
                    onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                    className="h-12 text-[14px] bg-transparent border-border/40 rounded-xl px-4"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer fixo — padrão app */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border/30 px-4 py-3 flex items-center gap-3">
          {editOpen && editingId && (
            <button
              type="button"
              onClick={() => { handleDelete(editingId); setEditOpen(false); setEditingId(null); setForm(emptyForm); }}
              className="w-12 h-12 rounded-xl border border-destructive/30 flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || updateMutation.isPending || !form.code.trim() || !form.nome.trim()}
            className="flex-1 h-12 rounded-xl text-[14px] font-semibold uppercase tracking-wider bg-foreground text-background hover:bg-foreground/90"
          >
            {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editOpen ? "Salvar" : "Criar Cupom"}
          </Button>
        </div>
      </div>
    );
  }

  /* ─── Mobile: List ─── */
  if (isMobile) {
    return (
      <div className="relative min-h-[60vh]">
        {/* Search bar */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 stroke-[1.8]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cupom por nome ou código..."
              className="h-11 text-[13px] pl-10 bg-card border-border/60 dark:border-white/[0.08] rounded-2xl placeholder:text-muted-foreground/40 shadow-xs focus-visible:ring-1 focus-visible:ring-foreground/20"
            />
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-foreground border-t-transparent animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-muted/30 border border-border/20 flex items-center justify-center mx-auto">
              <Ticket className="w-6 h-6 text-muted-foreground/30" strokeWidth={1.5} />
            </div>
            <p className="text-[12px] text-muted-foreground">
              {search ? "Nenhum cupom encontrado" : "Nenhum cupom cadastrado"}
            </p>
            {!search && (
              <button
                onClick={() => { setForm(emptyForm); setCreateOpen(true); }}
                className="text-[12px] text-foreground font-semibold"
              >
                Criar primeiro cupom
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((c) => {
              const status = getCouponStatus(c);
              return (
                <div
                  key={c.id}
                  className="rounded-xl border border-border/30 bg-card/80 p-3.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center shrink-0">
                      <Percent className="w-4 h-4 text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-foreground truncate">
                          {c.nome || c.code}
                        </span>
                        <Badge className={`${status.className} text-[9px] px-1.5 py-0 h-4 font-medium`}>
                          {status.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <code className="text-[10px] font-mono tracking-wider text-foreground/70">
                          {c.code}
                        </code>
                        <span className="text-[10px] font-semibold text-foreground/70">
                          {c.percent}% OFF
                        </span>
                        {(c.starts_at || c.expires_at) && (
                          <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                            <Calendar className="w-2.5 h-2.5" />
                            {c.expires_at
                              ? format(parseISO(c.expires_at), "dd/MM", { locale: ptBR })
                              : "∞"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={c.active}
                        onCheckedChange={() => handleToggle(c.id, c.active)}
                        className="scale-[0.8]"
                      />
                      <button
                        onClick={() => openEdit(c)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted/50 transition-colors"
                      >
                        <Pencil className="w-3 h-3 text-foreground/50" />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-3 h-3 text-foreground/50" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* FAB — botão flutuante */}
        <button
          onClick={() => { setForm(emptyForm); setCreateOpen(true); }}
          className="fixed bottom-6 right-5 z-30 w-12 h-12 rounded-full bg-foreground flex items-center justify-center shadow-lg active:scale-95 transition-all"
          aria-label="Novo cupom"
        >
          <Plus className="w-5 h-5 text-background" />
        </button>
      </div>
    );
  }

  /* ─── Desktop Layout ─── */
  const inactiveCoupons = cupons.filter(c => !c.active).length;

  return (
    <div className="space-y-4">
      {/* Stats + Search + Action */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border/30">
          <span className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Total</span>
          <span className="text-xs font-bold text-foreground">{cupons.length}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border/30">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Ativos</span>
          <span className="text-xs font-bold text-foreground">{activeCoupons}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border/30">
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
          <span className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Inativos</span>
          <span className="text-xs font-bold text-foreground">{inactiveCoupons}</span>
        </div>

        <div className="flex-1" />

        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cupom..."
            className="h-8 text-xs pl-8 bg-card border-border/30 rounded-lg"
          />
        </div>

        <Button
          onClick={() => { setForm(emptyForm); setCreateOpen(true); }}
          size="sm"
          className="h-8 gap-1.5 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90"
        >
          <Plus className="w-3.5 h-3.5" />
          Novo Cupom
        </Button>
      </div>

      {/* Grid de cupons */}
      {loading ? (
        <div className="rounded-xl border border-border/30 bg-card p-12 text-center">
          <div className="inline-block w-6 h-6 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border/30 bg-card p-12 text-center">
          <Ticket className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" strokeWidth={1} />
          <p className="text-sm font-medium text-foreground mb-1">
            {search ? "Nenhum cupom encontrado" : "Nenhum cupom cadastrado"}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            {search ? "Tente outro termo" : "Crie seu primeiro cupom de desconto"}
          </p>
          {!search && (
            <Button
              onClick={() => { setForm(emptyForm); setCreateOpen(true); }}
              size="sm"
              className="h-8 gap-1.5 text-xs bg-foreground text-background hover:bg-foreground/90"
            >
              <Plus className="w-3.5 h-3.5" />
              Criar Primeiro Cupom
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((c) => {
            const status = getCouponStatus(c);
            return (
              <div
                key={c.id}
                className="group rounded-xl border border-border/30 bg-card p-4 transition-all duration-200 hover:border-border/60 hover:shadow-md"
              >
                {/* Header */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-foreground/10 flex items-center justify-center shrink-0">
                    <Percent className="w-4 h-4 text-foreground" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[13px] font-semibold text-foreground truncate">{c.nome || c.code}</h3>
                    <code className="text-[10px] font-mono tracking-widest text-foreground/70">{c.code}</code>
                  </div>
                </div>

                {/* Info badges */}
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-foreground/10 border border-foreground/20 text-[10px] font-bold text-foreground">
                    {c.percent}% OFF
                  </span>
                  <span className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border",
                    status.className
                  )}>
                    {status.label}
                  </span>
                </div>

                {/* Datas */}
                {(c.starts_at || c.expires_at) && (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-3">
                    <Calendar className="w-3 h-3 shrink-0" />
                    <span>
                      {c.starts_at ? format(parseISO(c.starts_at), "dd/MM/yy", { locale: ptBR }) : "—"}
                      {" → "}
                      {c.expires_at ? format(parseISO(c.expires_at), "dd/MM/yy", { locale: ptBR }) : "∞"}
                    </span>
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-2.5 border-t border-border/20">
                  <Switch
                    checked={c.active}
                    onCheckedChange={() => handleToggle(c.id, c.active)}
                    className="scale-90"
                  />
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(c)}
                      className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-muted/50 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-destructive/10 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="border-border/40 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Novo Cupom</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Clientes aplicam o código ao agendar
            </DialogDescription>
          </DialogHeader>
          <CouponForm values={form} onChange={setForm} onSubmit={handleCreate} submitLabel="Criar Cupom" loading={createMutation.isPending} />
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="border-border/40 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Editar Cupom</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Alterações refletem em tempo real
            </DialogDescription>
          </DialogHeader>
          <CouponForm values={form} onChange={setForm} onSubmit={handleEdit} submitLabel="Salvar Alterações" loading={updateMutation.isPending} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

