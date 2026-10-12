import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock, Users, ChevronRight,
  Building2, Scissors, Package, Gift, Settings2,
} from "lucide-react";
import { BarberContext } from "@/pages/Barbeiro";
import AdminHorarios from "@/components/admin/AdminHorarios";
import { AdminUnidades } from "@/components/admin/unidades/AdminUnidades";
import { AdminPlanos } from "@/components/admin/AdminPlanos";
import { AdminPromocoes } from "@/components/admin/AdminPromocoes";
import { BarberClientes } from "@/components/barber/BarberClientes";
import { BarberCortes } from "@/components/barber/BarberCortes";
import { AdminConfiguracoes } from "@/components/admin/AdminConfiguracoes";

import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import profileBannerDefault from "@/assets/profile-banner-default.jpg";
import { useStatusBarColor } from "@/hooks/useStatusBarColor";

/**
 * Hub de Configurações da Empresa — visível apenas para o Barbeiro Central (tenant admin).
 * Organiza TODAS as configurações da barbearia em seções temáticas:
 *   - Dados da Empresa (Identificação, Contato, Endereço, Presença Online)
 *   - Operações (Horários, Unidades, Clientes, Serviços)
 *   - Comercial (Planos, Promoções)
 *   - Sistema (Configurações Gerais)
 *
 * Inclui seletor de unidade para alternar contexto.
 */

type HubScreen =
  | "hub"
  | "horarios"
  | "unidades"
  | "clientes"
  | "servicos"
  | "planos"
  | "promocoes"
  | "configuracoes";

interface HubSection {
  label: string;
  items: HubItem[];
}

interface HubItem {
  key: HubScreen;
  icon: typeof Clock;
  title: string;
  description: string;
  color: string;
}

interface Unidade {
  id: string;
  nome: string;
  is_sede: boolean;
}

const hubSections: HubSection[] = [
  {
    label: "Operações",
    items: [
      {
        key: "unidades",
        icon: Building2,
        title: "Unidades / Filiais",
        description: "Edite identificação, contato, endereço e presença online de cada unidade",
        color: "text-violet-500 bg-violet-500/10",
      },
      {
        key: "horarios",
        icon: Clock,
        title: "Horários da Barbearia",
        description: "Horários globais de funcionamento",
        color: "text-amber-500 bg-amber-500/10",
      },
      {
        key: "clientes",
        icon: Users,
        title: "Todos os Clientes",
        description: "Base completa de clientes da barbearia",
        color: "text-indigo-500 bg-indigo-500/10",
      },
      {
        key: "servicos",
        icon: Scissors,
        title: "Serviços da Barbearia",
        description: "Catálogo de serviços oferecidos",
        color: "text-orange-500 bg-orange-500/10",
      },
    ],
  },
  {
    label: "Comercial",
    items: [
      {
        key: "planos",
        icon: Package,
        title: "Planos de Assinatura",
        description: "Planos de fidelidade para clientes",
        color: "text-pink-500 bg-pink-500/10",
      },
      {
        key: "promocoes",
        icon: Gift,
        title: "Campanhas / Promoções",
        description: "Campanhas promocionais ativas",
        color: "text-rose-500 bg-rose-500/10",
      },
    ],
  },
  {
    label: "Sistema",
    items: [
      {
        key: "configuracoes",
        icon: Settings2,
        title: "Configurações Gerais",
        description: "Integrações, webhook e manutenção",
        color: "text-gray-500 bg-gray-500/10",
      },
    ],
  },
];

interface BarberConfigBarbeariaProps {
  barberContext: BarberContext;
  basePath?: string;
  appBasePath?: string;
}

export function BarberConfigBarbearia({
  barberContext,
  basePath = "/barbeiro/config-barbearia",
  appBasePath = "/barbeiro",
}: BarberConfigBarbeariaProps) {
  const navigate = useNavigate();
  const [activeScreen, setActiveScreen] = useState<HubScreen>("hub");
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [selectedUnidadeId, setSelectedUnidadeId] = useState<string | null>(null);
  
  const [loadingUnidades, setLoadingUnidades] = useState(true);
  const [tenantNome, setTenantNome] = useState<string>("");
  const [tenantLogoUrl, setTenantLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);

  useStatusBarColor("app-background");

  /** Carrega tenant (nome + logo) e banner herdado do admin */
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!barberContext.tenantId) return;
      const { data: tenant } = await supabase
        .from("tenants")
        .select("nome, logo_url")
        .eq("id", barberContext.tenantId)
        .maybeSingle();
      if (!mounted) return;
      if (tenant) {
        setTenantNome((tenant as any).nome || "");
        setTenantLogoUrl((tenant as any).logo_url || null);
      }
      try {
        const { data } = await supabase.rpc("get_admin_banner_for_barber", {
          p_barbeiro_id: barberContext.barbeiroId,
        });
        if (mounted && data) setBannerUrl(data as string);
      } catch {
        /* silencioso */
      }
    })();
    return () => { mounted = false; };
  }, [barberContext.tenantId, barberContext.barbeiroId]);

  /** Carrega unidades do tenant */
  useEffect(() => {
    if (!barberContext.tenantId) return;

    const loadUnidades = async () => {
      const { data, error } = await supabase
        .from("tenant_unidades")
        .select("id, nome, is_sede")
        .eq("tenant_id", barberContext.tenantId!)
        .eq("ativo", true)
        .order("is_sede", { ascending: false })
        .order("nome");

      if (!error && data) {
        setUnidades(data);
        const sede = data.find((u) => u.is_sede);
        if (sede) setSelectedUnidadeId(sede.id);
        else if (data.length > 0) setSelectedUnidadeId(data[0].id);
      }
      setLoadingUnidades(false);
    };

    loadUnidades();
  }, [barberContext.tenantId]);

  const selectedUnidade = unidades.find((u) => u.id === selectedUnidadeId);
  const hasMultipleUnits = unidades.length > 1;

  /** Flatten items for the profile-style list */
  const flatItems = hubSections.flatMap((s) =>
    s.items.map((i) => ({ ...i, section: s.label }))
  );

  const initials = (tenantNome || "B").charAt(0).toUpperCase();

  /** Encontra o item ativo (para header da sub-tela) */
  const activeItem = hubSections
    .flatMap((s) => s.items)
    .find((i) => i.key === activeScreen);

  /** Renderiza a sub-tela selecionada */
  const renderSubScreen = () => {
    const tenantId = barberContext.tenantId || undefined;
    switch (activeScreen) {
      case "horarios":
        return <AdminHorarios hideTitle companyMode tenantId={tenantId} />;
      case "unidades":
        return <AdminUnidades basePath={appBasePath} />;
      case "clientes":
        return (
          <BarberClientes
            barberContext={barberContext}
            forceViewMode="todos"
            initialUnitId={selectedUnidadeId}
          />
        );
      case "servicos":
        return <BarberCortes barberContext={barberContext} />;
      case "planos":
        return <AdminPlanos tenantId={tenantId} basePath={appBasePath} />;
      case "promocoes":
        return <AdminPromocoes tenantId={barberContext.tenantId} basePath={appBasePath} />;
      case "configuracoes":
        return <AdminConfiguracoes />;
      default:
        return null;
    }
  };

  /** Setinha de voltar — padrão curvado do sistema */
  const CurvedBackArrow = ({ className = "" }: { className?: string }) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a4 4 0 0 1 4 4v1" />
    </svg>
  );

  /** Hub principal — layout IDÊNTICO ao perfil (banner + avatar + nome + lista) */
  if (activeScreen === "hub") {
    return (
      <div className="min-h-[var(--app-height,100dvh)] bg-background pb-24 -mx-3 sm:-mx-4 -mt-2">
        {/* ═══ BANNER + AVATAR (edge-to-edge) ═══ */}
        <div className="relative isolate bg-background">
          <div
            className="relative w-full overflow-hidden bg-background"
            style={{ height: "calc(11rem + var(--app-safe-top, env(safe-area-inset-top, 0px)))" }}
          >
            <img
              src={bannerUrl || profileBannerDefault}
              alt="Banner da barbearia"
              className="w-full h-full object-cover"
              style={{ objectPosition: "center top" }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-background" />

            {/* Setinha curvada padrão do sistema sobre o banner */}
            <button
              type="button"
              onClick={() => navigate(appBasePath + "/perfil")}
              aria-label="Voltar"
              className="absolute left-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white active:opacity-70"
              style={{ top: "calc(0.75rem + var(--app-safe-top, env(safe-area-inset-top, 0px)))" }}
            >
              <CurvedBackArrow />
            </button>
          </div>

          {/* Avatar (logo da barbearia) sobrepondo o banner */}
          <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
            <Avatar className="h-24 w-24 border-[3px] border-background shadow-xl">
              <AvatarImage src={tenantLogoUrl || undefined} alt={tenantNome} className="object-cover" />
              <AvatarFallback className="bg-secondary text-foreground text-2xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        {/* ═══ NOME CENTRAL DA BARBEARIA (sem exibir sede aqui) ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="mt-16 flex flex-col items-center px-5"
        >
          <h2 className="text-[22px] font-bold text-foreground text-center">
            {tenantNome || "Sua Barbearia"}
          </h2>
          <p className="text-[12px] text-muted-foreground mt-1">Configurações da Barbearia</p>
        </motion.div>

        {/* ═══ ITENS — layout idêntico ao perfil ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="mt-8 mx-5"
        >
          {flatItems.map((item, idx) => (
            <div key={item.key}>
              <button
                onClick={() => setActiveScreen(item.key)}
                className="w-full grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-4 text-left active:opacity-70 transition-opacity"
              >
                <div className="min-w-0">
                  <span className="text-[15px] font-medium text-foreground block truncate">
                    {item.title}
                  </span>
                  <span className="text-[12px] text-muted-foreground block truncate">
                    {item.description}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
              </button>
              {idx < flatItems.length - 1 && <div className="h-px bg-border/40" />}
            </div>
          ))}
        </motion.div>
      </div>
    );
  }

  /**
   * Sub-tela — renderiza apenas a tela filha, sem cabeçalho/setinha do hub.
   * A navegação de volta é feita pela setinha própria da tela filha ou pela barra inferior.
   */
  return <div className="relative">{renderSubScreen()}</div>;
}
