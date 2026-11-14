import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Building2, Shield, Scissors, Users,
  Layers, Gift, Clock, Send, Wrench, ChevronRight,
  LogOut, Loader2, MessageCircle, Trash2, AlertTriangle, Crown, Headset,
  MapPin, ShoppingBag, Palette, ArrowLeftRight, CreditCard,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { signOutAndClearDevice } from "@/lib/sessionGuard";
import { useDadosEmpresaUnits } from "@/components/admin/dados-empresa/useDadosEmpresaUnits";

interface ProfileSettingsPageProps {
  basePath?: string;
  isTenant?: boolean;
  hideSubscription?: boolean;
  tenantId?: string | null;
}

interface SettingsItemData {
  icon: React.ElementType;
  label: string;
  description: string;
  path: string;
  adminOnly?: boolean;
  tenantOnly?: boolean;
}

interface SettingsSection {
  title: string;
  items: SettingsItemData[];
}

/**
 * Tela de Configurações — layout premium com seções agrupadas,
 * seletor de unidade e contraste adequado em dark/light mode.
 */
export function ProfileSettingsPage({
  basePath = "/admin",
  isTenant = false,
  hideSubscription = false,
  tenantId = null,
}: ProfileSettingsPageProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  /* ── Seletor de unidade ── */
  const { units, loading: loadingUnits, defaultUnit } = useDadosEmpresaUnits(tenantId);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const currentUnit = useMemo(
    () => units.find((u) => u.id === selectedUnitId) ?? defaultUnit,
    [units, selectedUnitId, defaultUnit],
  );

  /* ── Auth ── */
  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOutAndClearDevice();
      toast.success("Sessão encerrada");
    } catch {
      toast.error("Erro ao sair");
      setLoggingOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "EXCLUIR") return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão inválida");
      const { data, error } = await supabase.functions.invoke("delete-tenant-account", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao excluir");
      toast.success("Barbearia excluída com sucesso");
      await signOutAndClearDevice();
    } catch (e: any) {
      console.error("[DeleteAccount]", e);
      toast.error(e.message || "Erro ao excluir conta");
      setDeleting(false);
    }
  };

  /* ── Itens organizados em seções ── */
  const sections: SettingsSection[] = [
    {
      title: "Barbearia",
      items: [
        { icon: Building2, label: "Dados da Barbearia", description: "Identificação, contato, endereço e presença online", path: `${basePath}/dados-empresa` },
        { icon: Scissors, label: "Barbeiros", description: "Equipe, perfis, comissões e status", path: `${basePath}/barbeiros` },
        { icon: Users, label: "Clientes", description: "Cadastros, histórico e informações", path: `${basePath}/clientes` },
        { icon: MapPin, label: "Unidades", description: "Filiais, localizações e distribuição", path: `${basePath}/unidades`, tenantOnly: true },
      ],
    },
    {
      title: "Serviços",
      items: [
        { icon: Scissors, label: "Serviços e Cortes", description: "Preços, duração e categorias", path: `${basePath}/servicos/cortes` },
        { icon: Layers, label: "Planos e Assinaturas", description: "Planos mensais com recorrência", path: `${basePath}/servicos/planos` },
        { icon: Gift, label: "Promoções", description: "Ofertas, cupons e fidelidade", path: `${basePath}/promocoes` },
        { icon: ShoppingBag, label: "Loja", description: "Produtos, pedidos e estoque", path: `${basePath}/loja`, tenantOnly: true },
      ],
    },
    {
      title: "Operações",
      items: [
        { icon: CreditCard, label: "Formas de Pagamentos", description: "Habilitar ou desabilitar Pix e pagamento na barbearia", path: `${basePath}/config-barbearia?view=formas-pagamento` },
        { icon: Clock, label: "Gerenciamento de Horários", description: "Funcionamento, pausas e exceções da barbearia", path: `${basePath}/horarios?empresa=1` },
        { icon: Send, label: "Disparo de Mensagens", description: "Mensagens em massa via WhatsApp", path: `${basePath}/disparo` },
        { icon: MessageCircle, label: "WhatsApp", description: "Conexão, lembretes e automações", path: `${basePath}/whatsapp` },
        { icon: Gift, label: "Indicações", description: "Ciclos, indicações e possíveis fraudes", path: `${basePath}/indicacoes`, tenantOnly: true },
      ],
    },
    {
      title: "Sistema",
      items: [
        { icon: Shield, label: "Segurança", description: "Senha, 2FA e controle de acesso", path: `${basePath}/seguranca` },
        { icon: Wrench, label: "Configurações Gerais", description: "Preferências e integrações", path: `${basePath}/configuracoes`, adminOnly: true },
        { icon: Crown, label: "Minha Assinatura", description: "Plano, teste grátis e upgrade", path: `${basePath}/assinatura`, tenantOnly: true },
      ],
    },
  ];

  /* ── Filtro por role + busca ── */
  const filteredSections = useMemo(() => {
    const q = search.toLowerCase().trim();
    return sections
      .map((section) => {
        let items = section.items;
        if (isTenant) items = items.filter((i) => !i.adminOnly);
        else items = items.filter((i) => !i.tenantOnly);
        if (hideSubscription) items = items.filter((i) => i.label !== "Minha Assinatura");
        if (q) items = items.filter((i) => i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
        return { ...section, items };
      })
      .filter((s) => s.items.length > 0);
  }, [search, isTenant, hideSubscription]);

  const totalItems = filteredSections.reduce((acc, s) => acc + s.items.length, 0);

  /* ── Render ── */
  return (
    <>
      <div className="pb-8 -mx-3 -mt-3">
        {/* ─── Header fixo ─── */}
        <div
          className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/40"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="flex items-center gap-2.5 px-4 h-14">
            <button
              onClick={() => navigate(`${basePath}/perfil`)}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/60 active:scale-95 transition-all"
              aria-label="Voltar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                <path d="M9 14L4 9l5-5" />
                <path d="M4 9h10a4 4 0 0 1 4 4v1" />
              </svg>
            </button>
            <h1 className="text-[19px] font-bold tracking-tight text-foreground flex-1">
              Configurações
            </h1>
          </div>

          {/* Barra de busca */}
          <div className="px-4 pb-3 pt-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar configuração..."
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-secondary/50 border border-border/30 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
              />
            </div>
          </div>
        </div>

        {/* ─── Seletor de unidade (tenant only) ─── */}
        {isTenant && units.length > 0 && (
          <div className="px-4 pt-4 pb-2">
            <button
              onClick={() => setShowUnitPicker(true)}
              className={cn(
                "w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl",
                "bg-card border border-border/30 transition-all duration-200 text-left",
                "hover:border-primary/30 active:scale-[0.99]",
              )}
            >
              {/* Avatar / logo da unidade */}
              <div className="w-11 h-11 rounded-xl bg-secondary/60 border border-border/20 flex items-center justify-center shrink-0 overflow-hidden">
                {currentUnit?.logoUrl ? (
                  <img src={currentUnit.logoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="w-5 h-5 text-muted-foreground/50" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50 leading-none mb-1">
                  Unidade ativa
                </p>
                <p className="text-[14px] font-semibold text-foreground truncate leading-tight">
                  {loadingUnits ? "Carregando..." : currentUnit?.nome || "Selecionar"}
                </p>
              </div>

              {/* Botão trocar */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/60 border border-border/20 shrink-0">
                <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[11px] font-semibold text-muted-foreground">Trocar</span>
              </div>
            </button>
          </div>
        )}

        {/* ─── Seções agrupadas ─── */}
        <div className="px-4 pt-2 space-y-5">
          {filteredSections.map((section, sIdx) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: sIdx * 0.06 }}
            >
              {/* Título da seção */}
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/40 mb-2 px-1">
                {section.title}
              </p>

              {/* Cards da seção */}
              <div className="rounded-2xl border border-border/20 bg-card overflow-hidden divide-y divide-border/10">
                {section.items.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      const path = item.label === "Clientes" && currentUnit?.id
                        ? `${item.path}?unit=${currentUnit.id}`
                        : item.path;
                      navigate(path);
                    }}
                    className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-secondary/30 active:bg-secondary/50 active:scale-[0.995] transition-all"
                  >
                    <div className="w-9 h-9 rounded-xl bg-secondary/50 flex items-center justify-center shrink-0">
                      <item.icon className="w-[18px] h-[18px] text-foreground/70" strokeWidth={1.8} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-foreground leading-tight">
                        {item.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground/50 mt-0.5 leading-snug">
                        {item.description}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                  </button>
                ))}
              </div>
            </motion.div>
          ))}

          {/* Tema toggle */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: filteredSections.length * 0.06 }}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/40 mb-2 px-1">
              Aparência
            </p>
            <div className="rounded-2xl border border-border/20 bg-card overflow-hidden">
              <button
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-secondary/30 active:bg-secondary/50 transition-all"
              >
                <div className="w-9 h-9 rounded-xl bg-secondary/50 flex items-center justify-center shrink-0">
                  <Palette className="w-[18px] h-[18px] text-foreground/70" strokeWidth={1.8} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground leading-tight">Tema</p>
                  <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                    {isDark ? "Modo escuro ativado" : "Modo claro ativado"}
                  </p>
                </div>
                <div className={cn(
                  "relative w-10 h-[22px] rounded-full transition-all duration-200",
                  isDark ? "bg-primary" : "bg-secondary border border-border/40"
                )}>
                  <div className={cn(
                    "absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                    isDark ? "translate-x-[22px]" : "translate-x-[3px]"
                  )} />
                </div>
              </button>
            </div>
          </motion.div>

          {/* Empty state */}
          {totalItems === 0 && search.trim() && (
            <div className="text-center py-12">
              <Search className="w-6 h-6 text-muted-foreground/40 mx-auto" />
              <p className="text-[12px] text-muted-foreground/50 mt-2">
                Nenhuma configuração para "{search}"
              </p>
            </div>
          )}

          {/* ─── Ações perigosas ─── */}
          <div className="pt-4 space-y-px">
            {/* Sair */}
            <div className="rounded-2xl border border-border/20 bg-card overflow-hidden">
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-accent-red/10 active:bg-accent-red/15 transition-all"
              >
                {loggingOut ? (
                  <Loader2 className="w-5 h-5 text-accent-red animate-spin shrink-0" />
                ) : (
                  <LogOut className="w-5 h-5 text-accent-red shrink-0" strokeWidth={1.8} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-accent-red leading-tight">Sair da conta</p>
                  <p className="text-[11px] text-muted-foreground/50 mt-0.5">Encerrar sessão</p>
                </div>
              </button>
            </div>

            {/* Excluir barbearia */}
            <div className="rounded-2xl border border-destructive/15 bg-card overflow-hidden mt-2">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-destructive/5 active:bg-destructive/10 transition-all cursor-pointer"
              >
                <Trash2 className="w-5 h-5 text-destructive/70 shrink-0" strokeWidth={1.8} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-destructive/80 leading-tight">Excluir barbearia</p>
                  <p className="text-[11px] text-muted-foreground/40 mt-0.5">Solicitar exclusão definitiva com nossa equipe</p>
                </div>
                <ChevronRight className="w-4 h-4 text-destructive/40 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ UNIT PICKER FULLSCREEN ═══ */}
      <AnimatePresence>
        {showUnitPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-background pt-[env(safe-area-inset-top)]"
          >
            {/* Header */}
            <div
              className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border/40"
              style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
            >
              <div className="flex items-center gap-2.5 px-4 h-14">
                <button
                  onClick={() => setShowUnitPicker(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/60 active:scale-95 transition-all"
                  aria-label="Voltar"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                    <path d="M9 14L4 9l5-5" />
                    <path d="M4 9h10a4 4 0 0 1 4 4v1" />
                  </svg>
                </button>
                <h1 className="text-[19px] font-bold tracking-tight text-foreground flex-1">
                  Selecionar unidade
                </h1>
              </div>
            </div>

            <div className="px-4 pt-4 pb-8 space-y-2">
              <p className="text-[12px] text-muted-foreground/50 mb-3 px-1">
                Selecione a unidade para visualizar e editar suas configurações.
              </p>

              {units.map((unit, idx) => {
                const isActive = currentUnit?.id === unit.id;
                return (
                  <motion.button
                    key={unit.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: idx * 0.04 }}
                    onClick={() => {
                      setSelectedUnitId(unit.id);
                      setShowUnitPicker(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3.5 px-4 py-4 rounded-2xl text-left",
                      "border transition-all duration-200",
                      "hover:bg-secondary/30 active:scale-[0.99]",
                      isActive
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/20 bg-card"
                    )}
                  >
                    <div className="w-12 h-12 rounded-2xl border border-border/20 bg-secondary/40 overflow-hidden flex items-center justify-center shrink-0">
                      {unit.logoUrl ? (
                        <img src={unit.logoUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Building2 className="w-5 h-5 text-muted-foreground/40" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={cn(
                          "text-[14px] font-semibold truncate leading-tight",
                          isActive ? "text-primary" : "text-foreground"
                        )}>
                          {unit.nome}
                        </p>
                        {unit.is_sede && (
                          <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                            Principal
                          </span>
                        )}
                      </div>
                    </div>

                    {isActive && (
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ DELETE CONFIRMATION MODAL ═══ */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", duration: 0.35 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-card border border-border/80 dark:border-white/[0.1] rounded-2xl p-6 space-y-4 shadow-2xl"
            >
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                  <Trash2 className="w-7 h-7 text-destructive" strokeWidth={1.8} />
                </div>
              </div>

              <div className="text-center space-y-1.5">
                <h3 className="text-[16px] font-semibold text-foreground">Solicitar exclusão da barbearia</h3>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  Para segurança dos seus dados, quitação de saldos e encerramento de assinaturas, a exclusão permanente deve ser solicitada à nossa equipe de suporte.
                </p>
              </div>

              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3.5 space-y-1.5 text-[11.5px] text-muted-foreground">
                <p className="font-medium text-foreground">
                  Nossa equipe auxiliará em:
                </p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Encerramento de repasses e saldos</li>
                  <li>Cancelamento de assinaturas ativas</li>
                  <li>Desativação segura do domínio e dados</li>
                </ul>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const unitName = currentUnit?.nome || "";
                    const msg = unitName
                      ? `Olá! Preciso de suporte no app DUB para solicitar a exclusão permanente da barbearia (${unitName}) 🙏`
                      : "Olá! Preciso de suporte no app DUB 🙏";
                    window.open(
                      `https://wa.me/5511963390043?text=${encodeURIComponent(msg)}`,
                      "_blank",
                      "noopener,noreferrer"
                    );
                    setShowDeleteConfirm(false);
                  }}
                  className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-semibold text-[13px] transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Falar com suporte no WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="w-full h-10 rounded-xl bg-secondary border border-border/30 text-[13px] font-medium text-foreground hover:bg-secondary/80 transition-colors cursor-pointer"
                >
                  Voltar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ BOTÃO FLUTUANTE SUPORTE ═══ */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        onClick={() =>
          window.open(
            "https://wa.me/5511963390043?text=" + encodeURIComponent("Olá! Preciso de suporte no app DUB 🙏"),
            "_blank",
            "noopener,noreferrer",
          )
        }
        className="fixed bottom-6 right-4 z-40 flex items-center gap-2 h-11 px-5 rounded-full bg-foreground text-background shadow-premium hover:shadow-premium-hover active:scale-[0.97] transition-all"
      >
        <div className="relative">
          <Headset className="w-4 h-4" />
          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-background" />
        </div>
        <span className="text-[13px] font-semibold">Suporte</span>
      </motion.button>
    </>
  );
}
