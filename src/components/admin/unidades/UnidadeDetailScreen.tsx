import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  useToggleUnidadeAtiva,
  useSalvarDadosUnidade,
  useSalvarEnderecoUnidade,
  useSalvarBarbeirosUnidade,
  useDeletarUnidade,
} from "@/hooks/useAdminMutations";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Trash2, Loader2, AlertTriangle, Store, MapPin, UserPlus } from "lucide-react";
import { WizardStepDados, type UnidadeDados } from "./wizard/WizardStepDados";
import { WizardStepEndereco, type UnidadeEndereco } from "./wizard/WizardStepEndereco";
import { UnitMemberList } from "./UnitMemberList";
import { AddBarberToUnitSheet } from "./AddBarberToUnitSheet";

import { AdminCortes } from "@/components/admin/AdminCortes";
import { AdminPlanos } from "@/components/admin/AdminPlanos";
import AdminHorarios from "@/components/admin/AdminHorarios";
import { WhatsAppConnectionPage } from "@/components/whatsapp/WhatsAppConnectionPage";
import { AdminLoja } from "@/components/admin/loja/AdminLoja";
import { AiAgentPage } from "@/components/ai/AiAgentPage";
import profileBannerDefault from "@/assets/profile-banner-default.jpg";
import type { Unidade } from "./AdminUnidades";

type DetailSection =
  | "menu"
  | "dados"
  | "endereco"
  | "servicos"
  | "planos"
  | "barbeiros"
  | "horarios"
  | "loja"
  | "whatsapp"
  | "agente"
  | "delete-confirm";

interface UnidadeDetailScreenProps {
  open: boolean;
  onClose: () => void;
  unidade: Unidade;
  tenantId: string;
  onSaved: () => void;
}

const SECTION_TITLES: Record<DetailSection, string> = {
  menu: "",
  dados: "Dados da unidade",
  endereco: "Endereço",
  servicos: "Serviços",
  planos: "Planos",
  barbeiros: "Barbeiros",
  horarios: "Horários",
  loja: "Loja",
  whatsapp: "WhatsApp",
  agente: "Agente de IA",
  "delete-confirm": "Excluir unidade",
};

/** Setinha curvada — padrão do sistema */
const CurvedBackArrow = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a4 4 0 0 1 4 4v1" />
  </svg>
);

/**
 * Tela full-screen de uma barbearia (unidade).
 * Segue o mesmo layout do Perfil: banner + logo + nome + lista de seções.
 */
export function UnidadeDetailScreen({
  open, onClose, unidade, tenantId, onSaved,
}: UnidadeDetailScreenProps) {
  const [section, setSection] = useState<DetailSection>("menu");
  const [addBarberOpen, setAddBarberOpen] = useState(false);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [ativo, setAtivo] = useState<boolean>(unidade.ativo);

  /** Altura do teclado virtual (iOS/Android) para manter os campos confortáveis */
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      const diff = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardHeight(diff > 80 ? Math.round(diff) : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);


  const toggleUnidadeAtiva = useToggleUnidadeAtiva(tenantId);
  const salvarDados = useSalvarDadosUnidade(tenantId);
  const salvarEndereco = useSalvarEnderecoUnidade(tenantId);
  const salvarBarbeiros = useSalvarBarbeirosUnidade(tenantId);
  const deletarUnidade = useDeletarUnidade(tenantId);

  const [dados, setDados] = useState<UnidadeDados>({
    nome: "", slogan: "", email: "", telefone: "", whatsapp: "", site: "",
  });
  const [endereco, setEndereco] = useState<UnidadeEndereco>({
    cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
  });
  const [linkedBarberIds, setLinkedBarberIds] = useState<string[]>([]);
  const [barberCount, setBarbersCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    setSection("menu");
    setAtivo(unidade.ativo);



    setDados({
      nome: unidade.nome || "",
      slogan: unidade.slogan || "",
      email: unidade.email || "",
      telefone: unidade.telefone || "",
      whatsapp: unidade.whatsapp || "",
      site: unidade.site || "",
    });
    setEndereco({
      cep: unidade.cep || "",
      rua: unidade.rua || "",
      numero: unidade.numero || "",
      complemento: unidade.complemento || "",
      bairro: unidade.bairro || "",
      cidade: unidade.cidade || "",
      estado: unidade.estado || "",
    });

    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id));
    loadLinkedBarbers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unidade.id]);

  const loadLinkedBarbers = async () => {
    const { data: links } = await supabase
      .from("barbeiro_unidades")
      .select("barbeiro_id")
      .eq("unidade_id", unidade.id);

    const ids = (links || []).map((l) => l.barbeiro_id);
    setLinkedBarberIds(ids);
    setBarbersCount(ids.length || unidade.barber_count || 0);
  };

  const goBackToMenu = () => setSection("menu");

  /* ═══ Saves ═══ */
  const handleSaveDados = () => {
    if (!dados.nome.trim()) {
      toast.error("Nome da unidade é obrigatório");
      return;
    }
    salvarDados.mutate(
      {
        unidadeId: unidade.id,
        nome: dados.nome.trim(),
        slogan: dados.slogan || null,
        email: dados.email || null,
        telefone: dados.telefone || null,
        whatsapp: dados.whatsapp || null,
        site: dados.site || null,
      },
      { onSuccess: () => { onSaved(); goBackToMenu(); } }
    );
  };

  const handleSaveEndereco = () => {
    salvarEndereco.mutate(
      {
        unidadeId: unidade.id,
        cep: endereco.cep || null,
        rua: endereco.rua || null,
        numero: endereco.numero || null,
        complemento: endereco.complemento || null,
        bairro: endereco.bairro || null,
        cidade: endereco.cidade || null,
        estado: endereco.estado || null,
      },
      { onSuccess: () => { onSaved(); goBackToMenu(); } }
    );
  };

  const handleSaveBarbeiros = () => {
    salvarBarbeiros.mutate(
      { unidadeId: unidade.id, barbeiroIds: linkedBarberIds },
      { onSuccess: () => { loadLinkedBarbers(); onSaved(); goBackToMenu(); } }
    );
  };

  const handleDeleteUnit = () => {
    deletarUnidade.mutate(unidade.id, {
      onSuccess: () => { onSaved(); onClose(); },
    });
  };

  const getSaveHandler = () => {
    switch (section) {
      case "dados": return handleSaveDados;
      case "endereco": return handleSaveEndereco;
      default: return null;
    }
  };

  const isSaving = salvarDados.isPending || salvarEndereco.isPending || salvarBarbeiros.isPending;

  /* ═══ Itens do hub (mesma lista do Perfil) ═══ */
  const menuItems: { key: DetailSection; label: string; desc: string }[] = [
    {
      key: "dados",
      label: "Dados da unidade",
      desc: "Nome, e-mail, telefone, WhatsApp e site",
    },
    {
      key: "endereco",
      label: "Endereço",
      desc: [endereco.bairro, endereco.cidade, endereco.estado].filter(Boolean).join(", ") || "Localização da unidade",
    },
    {
      key: "servicos",
      label: "Serviços",
      desc: "Catálogo de cortes e serviços desta barbearia",
    },
    {
      key: "planos",
      label: "Planos",
      desc: "Planos de assinatura oferecidos",
    },
    {
      key: "barbeiros",
      label: "Barbeiros",
      desc: `${barberCount} profissiona${barberCount === 1 ? "l" : "is"} vinculado${barberCount === 1 ? "" : "s"}`,
    },
    {
      key: "horarios",
      label: "Horários",
      desc: "Horário geral de funcionamento",
    },
    {
      key: "loja",
      label: "Loja",
      desc: "Produtos, pedidos, cupons e vendas",
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      desc: "Conexão de mensagens desta barbearia",
    },
    {
      key: "agente",
      label: "Agente de IA",
      desc: "Ative a Bia para responder seus clientes no WhatsApp",
    },
  ];

  const initials = (unidade.nome || "B").charAt(0).toUpperCase();
  const localizacao = [unidade.bairro, unidade.cidade, unidade.estado].filter(Boolean).join(", ");

  /* ═══ HUB ═══ */
  const renderHub = () => (
    <div className="pb-24">
      {/* Banner + logo */}
      <div className="relative isolate bg-background">
        <div
          className="relative w-full overflow-hidden bg-background"
          style={{ height: "calc(11rem + var(--app-safe-top, env(safe-area-inset-top, 0px)))" }}
        >
          <img
            src={profileBannerDefault}
            alt={`Banner da unidade ${unidade.nome}`}
            className="w-full h-full object-cover"
            style={{ objectPosition: "center top" }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-background" />

          <button
            type="button"
            onClick={onClose}
            aria-label="Voltar"
            className="absolute left-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white active:opacity-70"
            style={{ top: "calc(0.75rem + var(--app-safe-top, env(safe-area-inset-top, 0px)))" }}
          >
            <CurvedBackArrow />
          </button>
        </div>

        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
          <div className="h-24 w-24 rounded-full border-[3px] border-background shadow-xl bg-secondary overflow-hidden flex items-center justify-center">
            {unidade.logo_url ? (
              <img src={unidade.logo_url} alt={unidade.nome} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-semibold text-foreground">{initials}</span>
            )}
          </div>
        </div>
      </div>

      {/* Nome + status */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="mt-16 flex flex-col items-center px-5"
      >
        <h2 className="text-[22px] font-bold text-foreground text-center">{unidade.nome}</h2>
        {localizacao && (
          <p className="text-[12px] text-muted-foreground mt-1 flex items-center gap-1.5">
            <MapPin className="h-3 w-3" strokeWidth={1.5} />
            {localizacao}
          </p>
        )}
        {unidade.is_sede && (
          <span className="mt-2 text-[9px] font-semibold text-primary bg-primary/10 px-2 py-1 rounded-full uppercase tracking-wider">
            Matriz
          </span>
        )}
      </motion.div>

      {/* Unidade ativa — no topo */}
      <div className="mt-7 mx-5 flex items-center justify-between rounded-2xl border border-border/50 bg-card px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-foreground">Unidade ativa</p>
          <p className="text-[11.5px] text-muted-foreground">
            {ativo ? "Visível para os clientes" : "Oculta para os clientes"}
          </p>
        </div>
        <button
          onClick={() => {
            const next = !ativo;
            setAtivo(next);
            toggleUnidadeAtiva.mutate(
              { unidadeId: unidade.id, ativo: next },
              {
                onSuccess: () => onSaved(),
                onError: () => setAtivo(!next),
              }
            );
          }}
          disabled={toggleUnidadeAtiva.isPending}
          aria-label="Alternar unidade ativa"
          aria-pressed={ativo}
          className={cn(
            "w-11 h-6 rounded-full relative transition-colors duration-200 shrink-0",
            ativo ? "bg-emerald-500" : "bg-muted-foreground/30"
          )}
        >
          <span className={cn(
            "w-5 h-5 rounded-full bg-background shadow-sm absolute top-0.5 transition-transform duration-200",
            ativo ? "translate-x-[22px]" : "translate-x-0.5"
          )} />
        </button>
      </div>


      {/* Lista de seções — layout idêntico ao perfil */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="mt-6 mx-5"
      >
        {menuItems.map((item, idx) => (
          <div key={item.key}>
            <button
              onClick={() => setSection(item.key)}
              className="w-full grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-4 text-left active:opacity-70 transition-opacity"
            >
              <div className="min-w-0">
                <span className="text-[15px] font-medium text-foreground block truncate">{item.label}</span>
                <span className="text-[12px] text-muted-foreground block truncate">{item.desc}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
            </button>
            {idx < menuItems.length - 1 && <div className="h-px bg-border/40" />}
          </div>
        ))}
      </motion.div>

      {/* Excluir — não disponível para a matriz */}
      {!unidade.is_sede && (
        <div className="mt-8 mx-5">
          <button
            onClick={() => setSection("delete-confirm")}
            className="w-full h-12 rounded-xl border border-destructive/30 flex items-center justify-center gap-2 text-destructive text-[13px] font-medium active:opacity-70 transition-opacity"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
            Excluir unidade
          </button>
        </div>
      )}
    </div>
  );

  /* ═══ Conteúdo das seções ═══ */
  const renderSection = () => {
    switch (section) {
      case "dados":
        return <WizardStepDados data={dados} onChange={setDados} tenantId={tenantId} viewMode />;
      case "endereco":
        return <WizardStepEndereco data={endereco} onChange={setEndereco} viewMode />;
      case "servicos":
        return <AdminCortes tenantId={tenantId} hideHeader />;
      case "planos":
        return <AdminPlanos tenantId={tenantId} hideHeader />;
      case "horarios":
        return <AdminHorarios hideTitle companyMode tenantId={tenantId} />;
      case "loja":
        return <AdminLoja tenantId={tenantId} />;
      case "whatsapp":
        return (
          <WhatsAppConnectionPage
            hideHeader
            userId={userId}
            tenantId={tenantId}
            unidadeId={unidade.id}
            unidadeNome={unidade.nome}
            tenantNome={unidade.nome}
          />
        );
      case "agente":
        return (
          <AiAgentPage
            userId={userId}
            tenantNome={unidade.nome}
            onGoToWhatsApp={() => setSection("whatsapp")}
          />
        );
      case "barbeiros":
        return (
          <div className="space-y-3">
            <button
              onClick={() => setAddBarberOpen(true)}
              className="w-full h-12 rounded-2xl border border-border/60 bg-card flex items-center justify-center gap-2 text-[14px] font-medium text-foreground active:opacity-70 transition-opacity"
            >
              <UserPlus className="h-4 w-4" strokeWidth={1.6} /> Adicionar barbeiro
            </button>
            <UnitMemberList unidadeId={unidade.id} panelMode="admin" unitName={unidade.nome} />
            <AddBarberToUnitSheet
              open={addBarberOpen}
              onOpenChange={setAddBarberOpen}
              unidadeId={unidade.id}
              unidadeNome={unidade.nome}
              onSuccess={() => loadLinkedBarbers()}
            />
          </div>
        );
      case "delete-confirm":
        return (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-6 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2 max-w-[280px]">
              <h2 className="text-[20px] font-bold text-foreground">Tem certeza?</h2>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Ao excluir <strong className="text-foreground">{unidade.nome}</strong>, todos os vínculos de barbeiros,
                referências de agendamentos e configurações desta unidade serão removidos permanentemente.
              </p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  if (!open) return null;

  const saveHandler = getSaveHandler();
  const showSaveButton = !!saveHandler;
  const showDeleteButton = section === "delete-confirm";
  /** Seções que já trazem o próprio padding/scroll interno */
  const fullBleedSection = ["servicos", "planos", "horarios", "loja", "whatsapp", "agente"].includes(section);

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
      {section === "menu" ? (
        <div className="flex-1 overflow-y-auto">{renderHub()}</div>
      ) : (
        <>
          {/* Header padrão do sistema */}
          <div
            className="flex items-center gap-2.5 px-5 h-14 shrink-0"
            style={{ marginTop: "var(--app-safe-top, env(safe-area-inset-top, 0px))" }}
          >
            <button
              onClick={goBackToMenu}
              className="w-9 h-9 -ml-1 rounded-lg flex items-center justify-center text-foreground active:opacity-70 transition-opacity"
              aria-label="Voltar"
            >
              <CurvedBackArrow />
            </button>
            <h1 className="text-[20px] font-semibold tracking-tight text-foreground truncate">
              {SECTION_TITLES[section]}
            </h1>
          </div>

          <div
            className={cn(
              "flex-1 overflow-y-auto overscroll-contain",
              fullBleedSection ? "pt-0" : "px-5 pt-2"
            )}
            style={{
              paddingBottom: keyboardHeight > 0 ? `${keyboardHeight + 24}px` : "1.5rem",
              scrollPaddingBottom: `${keyboardHeight + 120}px`,
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={section}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              >
                {renderSection()}
              </motion.div>
            </AnimatePresence>
          </div>

          {(showSaveButton || showDeleteButton) && (
            <div
              className="px-5 pt-4 shrink-0 bg-background border-t border-border/30"
              style={{
                paddingBottom: keyboardHeight > 0
                  ? "1rem"
                  : "calc(1.25rem + var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)))",
              }}
            >
              {showDeleteButton ? (
                <button
                  onClick={handleDeleteUnit}
                  disabled={deletarUnidade.isPending}
                  className={cn(
                    "w-full h-[52px] rounded-2xl text-[15px] font-semibold flex items-center justify-center gap-2",
                    "transition-all duration-200 active:scale-[0.98]",
                    !deletarUnidade.isPending
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-destructive/60 text-destructive-foreground/70 cursor-not-allowed"
                  )}
                >
                  {deletarUnidade.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deletarUnidade.isPending ? "Excluindo..." : "Confirmar exclusão"}
                </button>
              ) : (
                <button
                  onClick={saveHandler || undefined}
                  disabled={isSaving}
                  className={cn(
                    "w-full h-[52px] rounded-2xl text-[15px] font-semibold flex items-center justify-center gap-2",
                    "transition-all duration-200 active:scale-[0.98]",
                    "bg-foreground text-background",
                    isSaving && "opacity-60 cursor-not-allowed"
                  )}
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSaving ? "Salvando..." : "Salvar alterações"}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>,
    document.body
  );
}
