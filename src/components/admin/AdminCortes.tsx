import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveOldestOwnedTenant } from "@/lib/tenantOwnership";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2, Plus, Scissors, Clock, Search, ChevronRight,
  DollarSign, Trash2, GripVertical,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCriarServico, useEditarServico, useDeletarServico } from "@/hooks/useAdminMutations";

interface Servico {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  duracao_minutos: number;
  ativo: boolean;
}

interface AdminCortesProps {
  tenantId?: string;
  basePath?: string;
  /** Oculta o cabeçalho interno quando embutido em outra tela */
  hideHeader?: boolean;
}

/** Cores para a barra lateral de cada serviço */
const SERVICE_COLORS = [
  "bg-violet-400", "bg-rose-400", "bg-amber-500", "bg-emerald-400",
  "bg-sky-400", "bg-orange-400", "bg-pink-400", "bg-teal-400",
];

function getServiceColor(index: number) {
  return SERVICE_COLORS[index % SERVICE_COLORS.length];
}

function formatDuration(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function AdminCortes({ tenantId, basePath = "/admin", hideHeader = false }: AdminCortesProps = {}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const isCreating = searchParams.get("novo") === "1";

  const [servicos, setServicos] = useState<Servico[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [servicoToDelete, setServicoToDelete] = useState<Servico | null>(null);

  // Form state for edit/create
  const [formData, setFormData] = useState({
    nome: "",
    descricao: "",
    preco: "",
    duracao_minutos: "30",
    ativo: true,
  });
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(tenantId ?? null);

  // Mutation hooks
  const criarServico = useCriarServico(resolvedTenantId || "");
  const editarServico = useEditarServico(resolvedTenantId || "");
  const deletarServico = useDeletarServico(resolvedTenantId || "");

  useEffect(() => {
    setResolvedTenantId(tenantId ?? null);
  }, [tenantId]);

  useEffect(() => {
    loadServicos();
    const channel = supabase
      .channel(`servicos-changes-${Math.random().toString(36).slice(2, 9)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "servicos" }, () => loadServicos())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [resolvedTenantId]);

  useEffect(() => {
    if (resolvedTenantId) return;
    let mounted = true;
    const resolveTenantId = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId || !mounted) return;

      const [{ data: barberRow }, { data: ownerTenant }] = await Promise.all([
        supabase
          .from("barbeiros")
          .select("tenant_id")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        resolveOldestOwnedTenant<{ id: string }>(userId, "id"),
      ]);

      if (mounted) setResolvedTenantId(barberRow?.tenant_id || ownerTenant?.id || null);
    };

    resolveTenantId();
    return () => { mounted = false; };
  }, [resolvedTenantId]);

  // Populate form when editing
  useEffect(() => {
    if (editId && servicos.length > 0) {
      const s = servicos.find(sv => sv.id === editId);
      if (s) {
        setFormData({
          nome: s.nome,
          descricao: s.descricao || "",
          preco: s.preco.toString(),
          duracao_minutos: s.duracao_minutos.toString(),
          ativo: s.ativo,
        });
      }
    }
    if (isCreating) {
      setFormData({ nome: "", descricao: "", preco: "", duracao_minutos: "30", ativo: true });
    }
  }, [editId, isCreating, servicos]);

  const loadServicos = async () => {
    try {
      /* Select apenas campos usados na tela de serviços */
      let query = supabase.from("servicos").select("id, nome, descricao, preco, duracao_minutos, ativo, tenant_id, created_at").order("nome");
      if (resolvedTenantId) {
        query = query.eq("tenant_id", resolvedTenantId);
      } else {
        query = query.is("tenant_id", null);
      }
      const { data, error } = await query;
      if (error) throw error;
      setServicos(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar serviços: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return servicos;
    const q = searchQuery.toLowerCase();
    return servicos.filter(s => s.nome.toLowerCase().includes(q));
  }, [servicos, searchQuery]);

  const saving = criarServico.isPending || editarServico.isPending;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome.trim() || !formData.preco || !formData.duracao_minutos) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    const payload = {
      nome: formData.nome.trim(),
      descricao: formData.descricao.trim() || null,
      preco: parseFloat(formData.preco),
      duracao_minutos: parseInt(formData.duracao_minutos),
      ativo: formData.ativo,
      ...(resolvedTenantId ? { tenant_id: resolvedTenantId } : {}),
    };

    if (editId) {
      editarServico.mutate(
        { servicoId: editId, dados: payload },
        { onSuccess: () => goBack() }
      );
    } else {
      criarServico.mutate(
        { nome: payload.nome, preco: payload.preco, duracao: payload.duracao_minutos, descricao: payload.descricao || undefined },
        { onSuccess: () => goBack() }
      );
    }
  };

  const handleDelete = async () => {
    if (!servicoToDelete) return;
    deletarServico.mutate(servicoToDelete.id, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        setServicoToDelete(null);
        if (editId === servicoToDelete.id) goBack();
      },
      onError: () => {
        setDeleteDialogOpen(false);
      },
    });
  };

  const goBack = () => {
    setSearchParams({});
  };

  const openEdit = (id: string) => {
    setSearchParams({ edit: id });
  };

  const openCreate = () => {
    setSearchParams({ novo: "1" });
  };

  // Duration options
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  // ═══════════════════════════════════
  // EDIT / CREATE FULL-PAGE VIEW
  // ═══════════════════════════════════
  if (editId || isCreating) {
    const editingServico = editId ? servicos.find(s => s.id === editId) : null;
    const pageTitle = editId ? (editingServico?.nome || "Editar Serviço") : "Novo Serviço";
    const charCount = formData.nome.length;

    return (
      <div className="pb-8 -mx-3 -mt-3">
        {/* Header fixo */}
        <div className="sticky top-0 z-30 bg-background">
          <div className="flex items-center gap-2.5 px-4 h-14">
            <button
              onClick={goBack}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all"
              aria-label="Voltar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                <path d="M9 14L4 9l5-5" />
                <path d="M4 9h10a4 4 0 0 1 4 4v1" />
              </svg>
            </button>
            <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1">{pageTitle}</h1>
          </div>
        </div>

        <form onSubmit={handleSave} className="px-4 pt-5 space-y-6">
          {/* Seção: Detalhes principais */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-4 px-1">
              Detalhes principais (obrigatório)
            </p>

            <div className="space-y-4">
              {/* Nome do serviço */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                  Nome do Serviço
                </label>
                <Input
                  value={formData.nome}
                  onChange={e => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Ex: Corte Social"
                  maxLength={50}
                  className="h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl px-4 placeholder:text-muted-foreground/30"
                  required
                />
                <p className="text-[10px] text-muted-foreground/40 text-right px-1">{charCount} / 50</p>
              </div>

              {/* Preço */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                    Preço
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-muted-foreground/50 font-medium">R$</span>
                    <Input
                      type="number"
                      step="5"
                      value={formData.preco}
                      onChange={e => setFormData({ ...formData, preco: e.target.value })}
                      placeholder="0,00"
                      className="h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl pl-11 pr-4 placeholder:text-muted-foreground/30"
                      required
                    />
                  </div>
                </div>

                {/* Duração */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                    Duração do Serviço
                  </label>
                  <Select
                    value={formData.duracao_minutos}
                    onValueChange={v => setFormData({ ...formData, duracao_minutos: v })}
                  >
                    <SelectTrigger className="h-12 text-[15px] font-medium bg-transparent border-border/40 rounded-xl px-4">
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {durationOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value} className="text-sm">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Seção: Detalhes adicionais */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-4 px-1">
              Detalhes adicionais
            </p>

            <div className="space-y-4">
              {/* Descrição */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1">
                  Descrição do serviço
                </label>
                <Textarea
                  value={formData.descricao}
                  onChange={e => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Breve descrição do serviço para os clientes"
                  rows={3}
                  className="text-[14px] bg-transparent border-border/40 rounded-xl px-4 py-3 resize-none placeholder:text-muted-foreground/30"
                />
              </div>

              {/* Status ativo/inativo */}
              <div className="flex items-center justify-between px-1 py-3">
                <div>
                  <p className="text-[13px] font-medium text-foreground">Serviço ativo</p>
                  <p className="text-[10.5px] font-extralight text-muted-foreground/70 mt-0.5">
                    {formData.ativo ? "Visível para clientes no agendamento" : "Oculto — não aparece para clientes"}
                  </p>
                </div>
                <Switch
                  checked={formData.ativo}
                  onCheckedChange={checked => setFormData({ ...formData, ativo: checked })}
                  className={cn(formData.ativo && "data-[state=checked]:bg-emerald-600")}
                />
              </div>
            </div>
          </div>

          {/* Footer: botões */}
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border/30 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)] flex items-center gap-3 lg:static lg:border-t-0 lg:px-0 lg:pt-4">
            {editId && (
              <button
                type="button"
                onClick={() => {
                  const s = servicos.find(sv => sv.id === editId);
                  if (s) { setServicoToDelete(s); setDeleteDialogOpen(true); }
                }}
                className="w-12 h-12 rounded-xl border border-destructive/30 flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <Button
              type="submit"
              disabled={saving}
              className="flex-1 h-12 rounded-xl text-[14px] font-semibold uppercase tracking-wider"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </Button>
          </div>
        </form>

        {/* Delete dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-[14px]">Remover serviço</AlertDialogTitle>
              <AlertDialogDescription className="text-[12px]">
                Remover <span className="text-foreground font-medium">{servicoToDelete?.nome}</span> permanentemente? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-9 text-[12px]">Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="h-9 text-[12px] bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ═══════════════════════════════════
  // SERVICE LISTING PAGE
  // ═══════════════════════════════════
  return (
    <div className="pb-28 lg:pb-8">
      {/* Mobile layout */}
      {isMobile ? (
        <div className="-mx-3 -mt-3">
          {/* Header */}
          <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/30">
            {!hideHeader && (
            <div className="flex items-center gap-2.5 px-4 h-14">
              <button
                onClick={() => navigate(`${basePath}/configuracoes-perfil`)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all"
                aria-label="Voltar"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                  <path d="M9 14L4 9l5-5" />
                  <path d="M4 9h10a4 4 0 0 1 4 4v1" />
                </svg>
              </button>
              <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1">Serviços e Cortes</h1>
            </div>
            )}

            {/* Search */}
            <div className="px-5 py-4">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar serviços..."
                  className="w-full h-14 pl-12 pr-4 bg-secondary/30 border border-border/30 rounded-2xl text-[15px] font-normal text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Service list */}
          <div className="px-4 pt-2">
            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <Scissors className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" strokeWidth={1.5} />
                <p className="text-[13px] text-muted-foreground">
                  {searchQuery ? "Nenhum serviço encontrado" : "Nenhum serviço cadastrado"}
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                <AnimatePresence mode="popLayout">
                  {filtered.map((servico, index) => (
                    <motion.button
                      key={servico.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15, delay: index * 0.02 }}
                      onClick={() => openEdit(servico.id)}
                      className="w-full flex items-center gap-3 py-4 text-left border-b border-border/30 last:border-b-0 hover:bg-secondary/20 active:bg-secondary/40 transition-colors"
                    >
                      {/* Drag handle icon */}
                      <GripVertical className="w-4 h-4 text-muted-foreground/25 flex-shrink-0" />

                      {/* Color bar */}
                      <div className={cn("w-1 h-10 rounded-full flex-shrink-0", getServiceColor(index))} />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-foreground truncate">{servico.nome}</p>
                        <p className="text-[12px] text-muted-foreground/60 mt-0.5">
                          {formatDuration(servico.duracao_minutos)}
                        </p>
                      </div>

                      {/* Price + chevron */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[14px] font-semibold text-foreground">
                          R$ {servico.preco.toFixed(2).replace(".", ",")}
                        </span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40" strokeWidth={1.8} />
                      </div>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* FAB Adicionar */}
          <div className="fixed bottom-6 right-5 z-40">
            <button
              onClick={openCreate}
              className="flex items-center justify-center w-12 h-12 rounded-full bg-foreground text-background shadow-lg hover:opacity-90 active:scale-95 transition-all"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        /* ═══ DESKTOP LAYOUT ═══ */
        <DesktopServiceList
          servicos={filtered}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onEdit={openEdit}
          onCreate={openCreate}
          onDelete={(s) => { setServicoToDelete(s); setDeleteDialogOpen(true); }}
          basePath={basePath}
        />
      )}

      {/* Delete dialog (listing context) */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[14px]">Remover serviço</AlertDialogTitle>
            <AlertDialogDescription className="text-[12px]">
              Remover <span className="text-foreground font-medium">{servicoToDelete?.nome}</span> permanentemente?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 text-[12px]">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="h-9 text-[12px] bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ═══════════════════════════════════ */
/* Desktop Service List               */
/* ═══════════════════════════════════ */

function DesktopServiceList({
  servicos,
  searchQuery,
  onSearchChange,
  onEdit,
  onCreate,
  onDelete,
  basePath,
}: {
  servicos: Servico[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onEdit: (id: string) => void;
  onCreate: () => void;
  onDelete: (s: Servico) => void;
  basePath: string;
}) {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-foreground">Serviços e Cortes</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{servicos.length} serviços cadastrados</p>
        </div>
        <Button onClick={onCreate} size="sm" className="h-9 px-4 rounded-lg text-xs font-semibold gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Novo Serviço
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
        <Input
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Pesquisar serviços..."
          className="h-9 pl-9 bg-muted/30 border-border/30 text-sm rounded-lg"
        />
      </div>

      {/* Grid */}
      {servicos.length === 0 ? (
        <div className="rounded-xl border border-border/30 bg-card p-10 text-center">
          <Scissors className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">Nenhum serviço encontrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
          {servicos.map((servico, idx) => (
            <motion.div
              key={servico.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: idx * 0.025 }}
              onClick={() => onEdit(servico.id)}
              className={cn(
                "group cursor-pointer rounded-xl border border-border/30 bg-card p-5 transition-all hover:shadow-md hover:border-border/50",
                !servico.ativo && "opacity-60"
              )}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className={cn("w-1 h-10 rounded-full", getServiceColor(idx))} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{servico.nome}</p>
                  <p className="text-xs text-muted-foreground/50 mt-0.5">{formatDuration(servico.duracao_minutos)}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">R$ {servico.preco.toFixed(2).replace(".", ",")}</span>
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-medium",
                  servico.ativo ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
                )}>
                  {servico.ativo ? "Ativo" : "Inativo"}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
