import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, Plus, Scissors, Search, ChevronRight, Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface Servico {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  duracao_minutos: number;
  ativo: boolean;
}

interface StepServicosProps {
  tenantId: string | null;
  onViewModeChange?: (mode: "list" | "edit") => void;
  addTrigger?: number;
  resetTrigger?: number;
}


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

/**
 * StepServicos — Etapa de serviços no onboarding do tenant.
 * Design idêntico ao AdminCortes, com state interno (sem URL search params).
 */
export function StepServicos({ tenantId, onViewModeChange, addTrigger, resetTrigger }: StepServicosProps) {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Navegação interna: null = lista, "novo" = criar, string = editId
  const [activeView, setActiveView] = useState<string | null>(null);
  const isEditing = activeView !== null && activeView !== "novo";
  const isCreating = activeView === "novo";

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [servicoToDelete, setServicoToDelete] = useState<Servico | null>(null);

  const [formData, setFormData] = useState({
    nome: "", descricao: "", preco: "", duracao_minutos: "30", ativo: true,
  });
  const [saving, setSaving] = useState(false);

  const [defaultCreated, setDefaultCreated] = useState(false);

  useEffect(() => { loadServicos(); }, [tenantId]);

  // Cria serviço padrão "Corte" automaticamente se não houver nenhum
  useEffect(() => {
    if (!loading && servicos.length === 0 && !defaultCreated && tenantId) {
      createDefaultService();
    }
  }, [loading, servicos.length, defaultCreated, tenantId]);

  // Reage ao trigger externo de "adicionar serviço"
  useEffect(() => {
    if (addTrigger && addTrigger > 0) {
      setActiveView("novo");
    }
  }, [addTrigger]);

  // Reage ao trigger externo de "voltar para lista"
  useEffect(() => {
    if (resetTrigger && resetTrigger > 0) {
      setActiveView(null);
    }
  }, [resetTrigger]);

  const createDefaultService = async () => {
    setDefaultCreated(true);
    try {
      const { error } = await supabase.from("servicos").insert({
        nome: "Corte",
        descricao: "Corte masculino tradicional",
        preco: 45.00,
        duracao_minutos: 30,
        ativo: true,
        tenant_id: tenantId,
      });
      if (error) throw error;
      await loadServicos();
    } catch {
      // Silencioso — usuário pode criar manualmente
    }
  };

  useEffect(() => {
    onViewModeChange?.(activeView !== null ? "edit" : "list");
  }, [activeView, onViewModeChange]);

  useEffect(() => {
    if (isEditing && servicos.length > 0) {
      const s = servicos.find(sv => sv.id === activeView);
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
  }, [activeView, servicos]);

  const loadServicos = async () => {
    try {
      let query = supabase.from("servicos").select("id, nome, descricao, preco, duracao_minutos, ativo").order("nome");
      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      } else {
        query = query.is("tenant_id", null);
      }
      const { data, error } = await query;
      if (error) throw error;
      setServicos(data || []);
    } catch {
      toast.error("Erro ao carregar serviços");
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return servicos;
    const q = searchQuery.toLowerCase();
    return servicos.filter(s => s.nome.toLowerCase().includes(q));
  }, [servicos, searchQuery]);

  const goBack = () => setActiveView(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome.trim() || !formData.preco || !formData.duracao_minutos) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    setSaving(true);
    const payload: any = {
      nome: formData.nome.trim(),
      descricao: formData.descricao.trim() || null,
      preco: parseFloat(formData.preco),
      duracao_minutos: parseInt(formData.duracao_minutos),
      ativo: formData.ativo,
    };
    if (tenantId) payload.tenant_id = tenantId;

    try {
      if (isEditing) {
        const { error } = await supabase.from("servicos").update(payload).eq("id", activeView!);
        if (error) throw error;
        toast.success("Serviço atualizado!");
      } else {
        const { error } = await supabase.from("servicos").insert(payload);
        if (error) throw error;
        toast.success("Serviço criado!");
      }
      await loadServicos();
      goBack();
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!servicoToDelete) return;
    try {
      const { error } = await supabase.from("servicos").delete().eq("id", servicoToDelete.id);
      if (error) throw error;
      toast.success("Serviço removido");
      setDeleteDialogOpen(false);
      setServicoToDelete(null);
      if (activeView === servicoToDelete.id) goBack();
      await loadServicos();
    } catch (error: any) {
      toast.error("Erro ao excluir: " + error.message);
      setDeleteDialogOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  // ═══════════════════════════════════
  // EDIT / CREATE VIEW (design AdminCortes)
  // ═══════════════════════════════════
  if (isEditing || isCreating) {
    const editingServico = isEditing ? servicos.find(s => s.id === activeView) : null;
    const pageTitle = isEditing ? (editingServico?.nome || "Editar Serviço") : "Novo Serviço";
    const charCount = formData.nome.length;

    return (
      <div className="pb-8">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-5">
          <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1 truncate">{pageTitle}</h1>
        </div>

        <form id="servico-form" onSubmit={handleSave} className="space-y-6">
          {/* Detalhes principais */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-4 px-1">
              Detalhes principais (obrigatório)
            </p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium px-1">
                  Nome do Serviço
                </label>
                <Input
                  value={formData.nome}
                  onChange={e => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Ex: Corte Social"
                  maxLength={50}
                  className="h-12 text-[15px] font-medium bg-transparent border-border rounded-xl px-4 placeholder:text-muted-foreground"
                  required
                  autoFocus
                />
                <p className="text-[10px] text-muted-foreground text-right px-1">{charCount} / 50</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium px-1">
                    Preço
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-muted-foreground font-medium">R$</span>
                    <Input
                      type="number"
                      step="5"
                      value={formData.preco}
                      onChange={e => setFormData({ ...formData, preco: e.target.value })}
                      placeholder="0,00"
                      className="h-12 text-[15px] font-medium bg-transparent border-border rounded-xl pl-11 pr-4 placeholder:text-muted-foreground"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium px-1">
                    Duração
                  </label>
                  <Select
                    value={formData.duracao_minutos}
                    onValueChange={v => setFormData({ ...formData, duracao_minutos: v })}
                  >
                    <SelectTrigger className="h-12 text-[15px] font-medium bg-transparent border-border rounded-xl px-4">
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

          {/* Detalhes adicionais */}
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-4 px-1">
              Detalhes adicionais
            </p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium px-1">
                  Descrição do serviço
                </label>
                <Textarea
                  value={formData.descricao}
                  onChange={e => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Breve descrição do serviço para os clientes"
                  rows={3}
                  className="text-[14px] bg-transparent border-border rounded-xl px-4 py-3 resize-none placeholder:text-muted-foreground"
                />
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">Serviço ativo</p>
                  <p className="text-[10.5px] font-extralight text-muted-foreground mt-0.5 truncate">
                    {formData.ativo ? "Visível para clientes" : "Oculto para clientes"}
                  </p>
                </div>
                <Switch
                  checked={formData.ativo}
                  onCheckedChange={checked => setFormData({ ...formData, ativo: checked })}
                  className={cn("shrink-0", formData.ativo && "data-[state=checked]:bg-emerald-600")}
                />
              </div>
            </div>
          </div>

          {/* Spacer for fixed footer */}
          <div className="h-48" />
        </form>

        {/* Fixed Footer — botão branco + lixeira branca */}
        <div className="fixed bottom-0 left-0 right-0 z-50 px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)] bg-gradient-to-t from-background via-background to-transparent">
          <div className="flex items-center gap-3 max-w-lg mx-auto">
            {isEditing && (
              <button
                type="button"
                onClick={() => {
                  const s = servicos.find(sv => sv.id === activeView);
                  if (s) { setServicoToDelete(s); setDeleteDialogOpen(true); }
                }}
                className="w-12 h-12 rounded-xl border border-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors flex-shrink-0"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button
              type="submit"
              form="servico-form"
              disabled={saving}
              className="flex-1 h-12 rounded-xl text-[14px] font-semibold uppercase tracking-wider bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
            </button>
          </div>
        </div>

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

  // ═══════════════════════════════════
  // SERVICE LISTING
  // ═══════════════════════════════════
  return (
    <div className="space-y-4 -mt-2">
      <div>
        <h2 className="text-[22px] font-semibold text-foreground leading-tight">
          Seus serviços
        </h2>
        <p className="text-[13px] text-foreground/90 mt-1">
          O que seus clientes podem agendar com você?
        </p>
      </div>

      {servicos.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Pesquisar serviços..."
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-secondary/30 border border-border text-[13px] font-normal text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
          />
        </div>
      )}

      {filtered.length === 0 && !searchQuery ? (
        <div className="text-center py-12">
          <Scissors className="w-10 h-10 mx-auto text-muted-foreground mb-3" strokeWidth={1.5} />
          <p className="text-[13px] text-muted-foreground mb-1">Nenhum serviço cadastrado</p>
          <p className="text-[11px] text-muted-foreground">
            Toque no botão abaixo para adicionar seu primeiro serviço
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[13px] text-muted-foreground">Nenhum serviço encontrado</p>
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
                onClick={() => setActiveView(servico.id)}
                className="w-full flex items-center gap-3 py-4 text-left border-b border-border last:border-b-0 hover:bg-secondary/20 active:bg-secondary/40 transition-colors"
              >
                <div className={cn("w-1 h-10 rounded-full flex-shrink-0", getServiceColor(index))} />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-foreground truncate">{servico.nome}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    {formatDuration(servico.duracao_minutos)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[14px] font-semibold text-foreground">
                    R$ {servico.preco.toFixed(2).replace(".", ",")}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" strokeWidth={1.8} />
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}

    </div>
  );
}
