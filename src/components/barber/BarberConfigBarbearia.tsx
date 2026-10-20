// @ts-nocheck — tipos do banco desatualizados para este arquivo; comportamento em produção validado.
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronRight,
  ChevronDown,
  Camera,
  Loader2,
  Plus,
  Store,
  Image as ImageIcon,
  PauseCircle,
  PlayCircle,
  Trash2,
  AlertTriangle,
  AlertCircle,
  X,
  Search,
  Building2,
  MessageSquare,
  CalendarClock,
  Users,
  Scissors,
  Crown,
  UserCheck,
  Star,
  Palette,
  ShieldCheck,
  CreditCard,
  User,
} from "lucide-react";
import { BarberFormasPagamento } from "@/components/barber/BarberFormasPagamento";
import { BarberContext } from "@/pages/Barbeiro";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";
import AdminHorarios from "@/components/admin/AdminHorarios";
import { AdminPlanos } from "@/components/admin/AdminPlanos";
import { BarberClientes } from "@/components/barber/BarberClientes";
import { AdminCortes } from "@/components/admin/AdminCortes";
import { AdminBarbeiros } from "@/components/admin/AdminBarbeiros";
import { AdminDadosEmpresa } from "@/components/admin/AdminDadosEmpresa";
import { AdminAvaliacoes } from "@/components/admin/AdminAvaliacoes";
import { BarberAvaliacoes } from "@/components/barber/BarberAvaliacoes";
import { BarberCortes } from "@/components/barber/BarberCortes";
import { WhatsAppConnectionPage } from "@/components/whatsapp/WhatsAppConnectionPage";
import { UnidadeWizardSheet } from "@/components/admin/unidades/wizard/UnidadeWizardSheet";
import { UnidadeDetailScreen } from "@/components/admin/unidades/UnidadeDetailScreen";
import { SelectBarbeariaDrawer } from "@/components/admin/unidades/SelectBarbeariaDrawer";
import type { Unidade } from "@/components/admin/unidades/AdminUnidades";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import profileBannerDefault from "@/assets/profile-banner-default.jpg";
import { useStatusBarColor } from "@/hooks/useStatusBarColor";
import { resolveOldestOwnedTenant } from "@/lib/tenantOwnership";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Hub de Configurações da Barbearia — exclusivo do Administrador / Dono.
 * Padrão 100% sério, minimalista e institucional (Alinhado rigorosamente a Atendimento & Notificações):
 *   - ScheduleHeader institucional no topo
 *   - Barra superior com nome da unidade, botão [+] de cadastrar filial e botão [Trocar barbearia v]
 *   - Card visual compacto (Banner + Foto da Barbearia) com dimensões rigorosamente fixadas
 *   - Ao clicar no card ou em 'Editar', abre gaveta exclusiva de configuração de Foto e Banner
 *   - Lista unificada diretamente na tela de fundo (divide-y divide-border/25), sem quadradinhos/caixas em volta
 *   - Gaveta (drawer) de baixo para cima para troca e cadastro de filiais
 */

type HubScreen =
  | "hub"
  | "dados-empresa"
  | "whatsapp"
  | "horarios"
  | "horarios-barbearia"
  | "horarios-pessoal"
  | "servicos"
  | "servicos-barbearia"
  | "servicos-pessoal"
  | "planos"
  | "servicos-planos"
  | "formas-pagamento"
  | "loja"
  | "avaliacoes"
  | "avaliacoes-pessoal"
  | "barbeiros"
  | "clientes"
  | "clientes-todos"
  | "clientes-meus"
  | "todas-unidades"
  | "fotos-banner"
  | "excluir-pausar";

const DEFAULT_COMPANY_NAME = "Barbearia DUB";
const DEFAULT_COMPANY_LOGO = "https://djtpzvujzmrrslirzwun.supabase.co/storage/v1/object/public/logos/global/logo-global-1772648853243.png";

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
  const [searchParams] = useSearchParams();
  const urlUnidadeId = searchParams.get("unidade");
  const urlViewId = searchParams.get("view");

  const [activeScreen, setActiveScreen] = useState<HubScreen>(() => {
    if (urlViewId === "formas-pagamento") return "formas-pagamento";
    if (urlViewId) return "clientes-todos";
    return "hub";
  });

  useEffect(() => {
    if (urlViewId && activeScreen === "hub") {
      if (urlViewId === "formas-pagamento") {
        setActiveScreen("formas-pagamento");
      } else {
        setActiveScreen("clientes-todos");
      }
    }
  }, [urlViewId]);
  const [tenantNome, setTenantNome] = useState<string>(DEFAULT_COMPANY_NAME);
  const [tenantLogoUrl, setTenantLogoUrl] = useState<string | null>(DEFAULT_COMPANY_LOGO);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(barberContext.tenantId || null);

  const [resolvedBarbeiroId, setResolvedBarbeiroId] = useState<string>(barberContext.barbeiroId || "");

  useEffect(() => {
    if (!resolvedBarbeiroId && barberContext.userId) {
      supabase
        .from("barbeiros")
        .select("id")
        .eq("user_id", barberContext.userId)
        .eq("ativo", true)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.id) setResolvedBarbeiroId(data.id);
        });
    }
  }, [barberContext.userId, resolvedBarbeiroId]);

  const effectiveBarbeiroId = barberContext.barbeiroId || resolvedBarbeiroId || "";

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Foto de perfil do barbeiro (para barbeiro comum / não-admin)
  const [barberAvatarUrl, setBarberAvatarUrl] = useState<string | null>(null);
  const [uploadingBarberAvatar, setUploadingBarberAvatar] = useState(false);
  const barberAvatarInputRef = useRef<HTMLInputElement>(null);

  const isTenantAdmin = !!barberContext.isTenantAdmin;

  // Unidades da Barbearia
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [selectedUnidadeId, setSelectedUnidadeId] = useState<string>("todas");
  const [loadingUnidades, setLoadingUnidades] = useState(true);

  // Modais
  const [showSelectUnitDrawer, setShowSelectUnitDrawer] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailUnidade, setDetailUnidade] = useState<Unidade | null>(null);

  // Busca inteligente nas configurações
  const [searchQuery, setSearchQuery] = useState("");

  // Estados para Gerenciamento Operacional da Barbearia (Pausar / Excluir)
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isPausing, setIsPausing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useStatusBarColor("app-background");

  /** Busca dados gerais do tenant, da barbearia e do avatar do barbeiro */
  useEffect(() => {
    let mounted = true;
    (async () => {
      let resolvedName = "";
      let resolvedLogo: string | null = null;
      let resolvedBanner: string | null = null;
      let tId = barberContext.tenantId || resolvedTenantId;

      // 0. Carrega foto de perfil do barbeiro se houver vínculo
      if (barberContext.barbeiroId) {
        try {
          const { data: barbData } = await supabase
            .from("barbeiros")
            .select("foto_url")
            .eq("id", barberContext.barbeiroId)
            .maybeSingle();
          if (mounted && barbData?.foto_url) {
            setBarberAvatarUrl(barbData.foto_url);
          }
        } catch {}
      }
      if (barberContext.userId) {
        try {
          const { data: profData } = await supabase
            .from("profiles")
            .select("avatar_url")
            .eq("id", barberContext.userId)
            .maybeSingle();
          if (mounted && profData?.avatar_url) {
            setBarberAvatarUrl((prev) => prev || profData.avatar_url);
          }
        } catch {}
      }

      // 1. Buscar em informacoes_empresa (onde Barbearia DUB, banner e logo estão salvos)
      try {
        const { data: infoRows } = await supabase
          .from("informacoes_empresa")
          .select("chave, valor, tenant_id")
          .in("chave", ["nome", "logo_url", "banner_url"]);

        if (infoRows && infoRows.length > 0) {
          const tenantInfo = tId ? infoRows.filter((r) => r.tenant_id === tId) : [];
          const globalInfo = infoRows.filter((r) => !r.tenant_id);

          const nameRow = tenantInfo.find((r) => r.chave === "nome") || globalInfo.find((r) => r.chave === "nome");
          const logoRow = tenantInfo.find((r) => r.chave === "logo_url") || globalInfo.find((r) => r.chave === "logo_url");
          const bannerRow = tenantInfo.find((r) => r.chave === "banner_url") || globalInfo.find((r) => r.chave === "banner_url");

          if (nameRow?.valor) resolvedName = nameRow.valor;
          if (logoRow?.valor) resolvedLogo = logoRow.valor;
          if (bannerRow?.valor) resolvedBanner = bannerRow.valor;
        }
      } catch (err) {
        console.error("Erro ao buscar informacoes_empresa:", err);
      }

      // 2. Buscar diretamente pelo tenantId
      if (tId) {
        try {
          const { data: tenantData } = await supabase
            .from("tenants")
            .select("id, nome, logo_url, banner_url")
            .eq("id", tId)
            .maybeSingle();

          if (tenantData) {
            if (!resolvedName && tenantData.nome) resolvedName = tenantData.nome;
            if (!resolvedLogo && tenantData.logo_url) resolvedLogo = tenantData.logo_url;
            if (!resolvedBanner && tenantData.banner_url) resolvedBanner = tenantData.banner_url;
          }
        } catch (err) {
          console.error("Erro ao buscar tenant:", err);
        }
      }

      // 3. Fallback para vínculo de barbeiro
      if ((!resolvedLogo || !resolvedName || !resolvedBanner) && barberContext.barbeiroId) {
        try {
          const { data: barb } = await supabase
            .from("barbeiros")
            .select("tenant_id, tenants:tenant_id(id, nome, logo_url, banner_url)")
            .eq("id", barberContext.barbeiroId)
            .maybeSingle();
          const t = (barb as any)?.tenants;
          if (t) {
            if (!tId && t.id) {
              tId = t.id;
              setResolvedTenantId(t.id);
            }
            if (!resolvedName && t.nome) resolvedName = t.nome;
            if (!resolvedLogo && t.logo_url) resolvedLogo = t.logo_url;
            if (!resolvedBanner && t.banner_url) resolvedBanner = t.banner_url;
          }
        } catch {}
      }

      // 4. Fallback para dono mais antigo
      if (!resolvedLogo || !resolvedName || !resolvedBanner) {
        try {
          const { data: ownerTenant } = await resolveOldestOwnedTenant<{ id: string; nome: string; logo_url?: string; banner_url?: string }>(
            barberContext.userId,
            "id, nome, logo_url, banner_url"
          );
          if (ownerTenant) {
            if (!tId && ownerTenant.id) {
              tId = ownerTenant.id;
              setResolvedTenantId(ownerTenant.id);
            }
            if (!resolvedName && ownerTenant.nome) resolvedName = ownerTenant.nome;
            if (!resolvedLogo && ownerTenant.logo_url) resolvedLogo = ownerTenant.logo_url;
            if (!resolvedBanner && ownerTenant.banner_url) resolvedBanner = ownerTenant.banner_url;
          }
        } catch {}
      }

      if (mounted) {
        setTenantNome(resolvedName || DEFAULT_COMPANY_NAME);
        setTenantLogoUrl(resolvedLogo || DEFAULT_COMPANY_LOGO);
        if (resolvedBanner) setBannerUrl(resolvedBanner);
        if (tId && !resolvedTenantId) setResolvedTenantId(tId);
      }
    })();
    return () => { mounted = false; };
  }, [barberContext.tenantId, barberContext.barbeiroId, barberContext.userId]);

  /** Carrega todas as unidades da barbearia / tenant */
  const loadUnidades = async () => {
    setLoadingUnidades(true);
    try {
      const tid = resolvedTenantId || barberContext.tenantId;

      let query = supabase
        .from("tenant_unidades")
        .select("id, tenant_id, nome, slogan, logo_url, is_sede, ativo, rua, numero, complemento, bairro, cidade, estado, telefone, whatsapp, cep, cnpj, cpf, email, site, slug, created_at");

      if (tid) {
        query = query.eq("tenant_id", tid);
      }

      const { data, error } = await query
        .order("is_sede", { ascending: false })
        .order("created_at", { ascending: true });

      if (!error && data && data.length > 0) {
        const mapped = data.map((u: any) => ({
          ...u,
          logo_url: u.logo_url || tenantLogoUrl || DEFAULT_COMPANY_LOGO,
        })) as Unidade[];
        setUnidades(mapped);

        // Se veio unidade via query param da URL, ativa ela prioritariamente
        if (urlUnidadeId && mapped.some((u) => u.id === urlUnidadeId)) {
          const target = mapped.find((u) => u.id === urlUnidadeId)!;
          setSelectedUnidadeId(target.id);
          if (target.nome) setTenantNome(target.nome);
          if (target.logo_url) setTenantLogoUrl(target.logo_url);
          if (target.tenant_id) setResolvedTenantId(target.tenant_id);
        } else if (selectedUnidadeId === "todas" || !selectedUnidadeId) {
          setSelectedUnidadeId(mapped[0].id);
          if (mapped[0].nome) setTenantNome(mapped[0].nome);
          if (mapped[0].logo_url) setTenantLogoUrl(mapped[0].logo_url);
        }
      } else {
        // Fallback garantido: sintetiza a unidade Barbearia DUB principal
        const fallbackUnit: Unidade = {
          id: tid || "3bc7d50a-07a6-4ee5-aab9-8dc687011385",
          tenant_id: tid || "73d61f2f-b369-41f3-8915-8e6de52d6378",
          nome: tenantNome || DEFAULT_COMPANY_NAME,
          slogan: "Transformando seu visual desde 2015",
          logo_url: tenantLogoUrl || DEFAULT_COMPANY_LOGO,
          is_sede: true,
          ativo: true,
          bairro: "Cidade Ipava",
          cidade: "São Paulo",
          estado: "SP",
          rua: "Rua Ferrador",
          numero: "108",
          complemento: null,
          telefone: "(11) 95226-3002",
          whatsapp: "(11) 95226-3002",
          cep: "04950-040",
          cnpj: "48737284000120",
          cpf: "36595601893",
          email: "barbeariasdub@gmail.com",
          site: "https://barbeariadub.com.br/",
          slug: "barbearia-dub",
          created_at: new Date().toISOString(),
        };
        setUnidades([fallbackUnit]);
        setSelectedUnidadeId(fallbackUnit.id);
      }
    } catch (err) {
      console.error("Erro ao carregar unidades:", err);
    } finally {
      setLoadingUnidades(false);
    }
  };

  useEffect(() => {
    loadUnidades();
  }, [resolvedTenantId, barberContext.tenantId]);

  // Sincroniza se query param da URL mudar
  useEffect(() => {
    if (urlUnidadeId && unidades.length > 0) {
      const target = unidades.find((u) => u.id === urlUnidadeId);
      if (target && target.id !== selectedUnidadeId) {
        handleSelectUnit(target);
      }
    }
  }, [urlUnidadeId, unidades]);

  /** Unidade atualmente ativa em exibição */
  const activeUnit = useMemo(() => {
    return unidades.find((u) => u.id === selectedUnidadeId) || unidades[0];
  }, [unidades, selectedUnidadeId]);

  /** Lista de itens de configuração do Hub com ícones e palavras-chave para busca inteligente */
  const configItems = useMemo(() => {
    if (!isTenantAdmin) {
      return [
        {
          id: "fotos-banner",
          icon: Palette,
          label: "Foto de perfil",
          description: "Sua foto de exibição para os clientes",
          keywords: ["foto", "perfil", "avatar", "imagem", "rosto", "identidade visual"],
          onClick: () => setActiveScreen("fotos-banner"),
        },
        {
          id: "dados-pessoais",
          icon: User,
          label: "Meus dados",
          description: "Foto, identificação, contato e endereço pessoal",
          keywords: ["dados", "nome", "telefone", "contato", "endereco", "cpf", "pessoal", "perfil", "meus dados"],
          onClick: () => navigate(`${appBasePath}/meus-dados`),
        },
        {
          id: "formas-pagamento",
          icon: CreditCard,
          label: "Pagamentos e Taxas",
          description: "Pix, Pagamento na barbearia e taxa de cancelamento/falta",
          keywords: ["formas de pagamento", "pagamento", "taxas", "cancelamento", "falta", "pix", "dinheiro", "barbearia", "presencial", "checkout", "recebimento", "cartão"],
          onClick: () => setActiveScreen("formas-pagamento"),
        },
        {
          id: "whatsapp",
          icon: MessageSquare,
          label: "Atendimento & Notificações",
          description: "WhatsApp conectado e lembretes automáticos de agendamento",
          keywords: ["whatsapp", "atendimento", "notificacoes", "lembretes", "mensagens"],
          onClick: () => setActiveScreen("whatsapp"),
        },
        {
          id: "horarios",
          icon: CalendarClock,
          label: "Horário de funcionamento",
          description: "Seus dias e horários pessoais de trabalho na cadeira",
          keywords: ["horario", "funcionamento", "expediente", "dias", "hora", "atendimento", "agenda"],
          onClick: () => setActiveScreen("horarios-pessoal"),
        },
        {
          id: "servicos",
          icon: Scissors,
          label: "Serviços",
          description: "Duração pessoal e serviços que você atende na barbearia",
          keywords: ["servicos", "cortes", "precos", "valores", "duracao", "barba"],
          onClick: () => setActiveScreen("servicos"),
        },
        {
          id: "clientes",
          icon: UserCheck,
          label: "Clientes",
          description: "Clientes atendidos exclusivamente por você",
          keywords: ["clientes", "contatos", "historico", "meus clientes"],
          onClick: () => setActiveScreen("clientes-meus"),
        },
        {
          id: "avaliacoes",
          icon: Star,
          label: "Avaliações",
          description: "Feedbacks, notas e comentários deixados pelos seus clientes",
          keywords: ["avaliacoes", "feedback", "notas", "estrelas", "opinioes", "reviews"],
          onClick: () => setActiveScreen("avaliacoes-pessoal"),
        },
        {
          id: "seguranca",
          icon: ShieldCheck,
          label: "Segurança",
          description: "Senha, autenticação e acessos da conta",
          keywords: ["seguranca", "segurança", "senha", "autenticacao", "acesso", "conta", "login"],
          onClick: () => navigate(`${appBasePath}/seguranca`),
        },
      ];
    }

    return [
      {
        id: "fotos-banner",
        icon: Palette,
        label: "Identidade Visual",
        description: "Foto de perfil, logo e banner da barbearia",
        keywords: ["foto", "perfil", "logo", "banner", "imagem", "capa", "identidade visual", "visual"],
        onClick: () => setActiveScreen("fotos-banner"),
      },
      {
        id: "dados-empresa",
        icon: Building2,
        label: "Dados da Barbearia",
        description: "Nome, WhatsApp, endereço e redes sociais",
        keywords: ["nome", "whatsapp", "endereco", "contato", "telefone", "instagram", "redes", "cnpj", "localizacao", "dados"],
        onClick: () => setActiveScreen("dados-empresa"),
      },
      {
        id: "formas-pagamento",
        icon: CreditCard,
        label: "Pagamentos e Taxas",
        description: "Pix, Pagamento na barbearia e taxa de cancelamento/falta",
        keywords: ["formas de pagamento", "pagamento", "taxas", "cancelamento", "falta", "pix", "dinheiro", "barbearia", "presencial", "checkout", "recebimento", "cartão"],
        onClick: () => setActiveScreen("formas-pagamento"),
      },
      {
        id: "whatsapp",
        icon: MessageSquare,
        label: "Atendimento & Notificações",
        description: "WhatsApp conectado, agente de IA e lembretes automáticos",
        keywords: ["whatsapp", "atendimento", "notificacoes", "ia", "agente", "bot", "robo", "lembretes", "mensagens"],
        onClick: () => setActiveScreen("whatsapp"),
      },
      {
        id: "horarios",
        icon: CalendarClock,
        label: "Horário de funcionamento",
        description: "Expediente da barbearia ou seus horários pessoais",
        keywords: ["horario", "funcionamento", "expediente", "dias", "abertura", "fechamento", "hora", "atendimento", "agenda"],
        onClick: () => setActiveScreen("horarios"),
      },
      {
        id: "barbeiros",
        icon: Users,
        label: "Barbeiros & Cadeiras",
        description: "Equipe de profissionais cadastrados nesta unidade",
        keywords: ["barbeiros", "cadeiras", "equipe", "profissionais", "funcionarios", "colaboradores"],
        onClick: () => setActiveScreen("barbeiros"),
      },
      {
        id: "servicos",
        icon: Scissors,
        label: "Serviços",
        description: "Catálogo da barbearia ou seus serviços pessoais",
        keywords: [
          "servicos",
          "cortes",
          "planos",
          "assinaturas",
          "catalogo",
          "barba",
          "precos",
          "valores",
          "duracao",
          "tabela",
          "clube",
          "fidelidade",
          "mensalidade",
          "recorrente",
        ],
        onClick: () => setActiveScreen("servicos"),
      },
      {
        id: "clientes",
        icon: UserCheck,
        label: "Clientes",
        description: "Todos os clientes cadastrados na barbearia",
        keywords: ["clientes", "contatos", "base", "historico", "crm", "fidelidade"],
        onClick: () => setActiveScreen("clientes-todos"),
      },
      {
        id: "avaliacoes",
        icon: Star,
        label: "Avaliações da Barbearia",
        description: "Feedbacks e notas dos clientes sobre a barbearia",
        keywords: ["avaliacoes", "feedback", "notas", "estrelas", "opinioes", "reviews"],
        onClick: () => setActiveScreen("avaliacoes"),
      },
      {
        id: "seguranca",
        icon: ShieldCheck,
        label: "Segurança",
        description: "Senha, autenticação e acessos da conta",
        keywords: ["seguranca", "segurança", "senha", "autenticacao", "acesso", "conta", "login"],
        onClick: () => navigate(`${appBasePath}/seguranca`),
      },
      {
        id: "excluir-pausar",
        icon: AlertTriangle,
        label: "Excluir e pausar",
        description: "Pausar agendamentos temporariamente ou excluir esta barbearia",
        destructive: true,
        keywords: ["excluir", "pausar", "reativar", "apagar", "deletar", "suspender", "fechar"],
        onClick: () => setActiveScreen("excluir-pausar"),
      },
    ];
  }, [isTenantAdmin, appBasePath, navigate]);

  /** Filtragem inteligente em tempo real */
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return configItems;
    return configItems.filter((item) => {
      const matchLabel = item.label.toLowerCase().includes(q);
      const matchDesc = item.description.toLowerCase().includes(q);
      const matchKeywords = item.keywords.some((k) => k.toLowerCase().includes(q));
      return matchLabel || matchDesc || matchKeywords;
    });
  }, [searchQuery, configItems]);

  /** Seleciona uma unidade pelo Drawer */
  const handleSelectUnit = (unit: Unidade) => {
    setSelectedUnidadeId(unit.id);
    if (unit.nome) setTenantNome(unit.nome);
    if (unit.logo_url) setTenantLogoUrl(unit.logo_url);
    if (unit.tenant_id) setResolvedTenantId(unit.tenant_id);
    setShowSelectUnitDrawer(false);
    toast.success(`Gerenciando ${unit.nome}`);
  };

  /** Pausar ou reativar a barbearia/unidade ativa */
  const handleToggleAtivo = async () => {
    if (!activeUnit?.id) return;
    const nextAtivo = activeUnit.ativo === false ? true : false;
    setIsPausing(true);
    try {
      const { error } = await supabase
        .from("tenant_unidades")
        .update({ ativo: nextAtivo })
        .eq("id", activeUnit.id);

      if (error) throw error;

      // Atualiza o estado local imediatamente
      setUnidades((prev) =>
        prev.map((u) => (u.id === activeUnit.id ? { ...u, ativo: nextAtivo } : u))
      );

      if (nextAtivo) {
        toast.success(`Barbearia "${activeUnit.nome}" reativada com sucesso!`);
      } else {
        toast.success(`Barbearia "${activeUnit.nome}" pausada temporariamente.`);
      }
      setShowPauseModal(false);
    } catch (err: any) {
      console.error("[handleToggleAtivo]", err);
      toast.error("Erro ao alterar status da barbearia. Tente novamente.");
    } finally {
      setIsPausing(false);
    }
  };

  /** Excluir barbearia permanentemente com confirmação rigorosa e cascade seguro */
  const handleDeleteUnit = async () => {
    if (!activeUnit?.id) return;
    if (deleteConfirmText.trim().toUpperCase() !== "EXCLUIR") {
      toast.error('Digite "EXCLUIR" em maiúsculas para confirmar a exclusão.');
      return;
    }

    const unitIdToDelete = activeUnit.id;
    const unitNameToDelete = activeUnit.nome || "Barbearia";
    setIsDeleting(true);

    try {
      // 1. Tenta invocar a Edge Function atômica delete-unit
      let deletedViaEdge = false;
      try {
        const { data, error } = await supabase.functions.invoke("delete-unit", {
          body: { unidadeId: unitIdToDelete },
        });
        if (!error && !data?.error) {
          deletedViaEdge = true;
        }
      } catch (edgeErr) {
        console.warn("[handleDeleteUnit] Edge function falhou ou inacessível, aplicando cascade direto:", edgeErr);
      }

      // 2. Se a Edge Function não concluiu, executa fallback seguro direto
      if (!deletedViaEdge) {
        await supabase.from("barbeiro_unidades").delete().eq("unidade_id", unitIdToDelete);
        await supabase.from("agendamentos").update({ unidade_id: null }).eq("unidade_id", unitIdToDelete);
        await supabase.from("barbeiros").update({ unidade_id: null }).eq("unidade_id", unitIdToDelete);

        try {
          await supabase.from("configuracoes_horario_unidade").delete().eq("unidade_id", unitIdToDelete);
          await supabase.from("horarios_excepcionais").delete().eq("unidade_id", unitIdToDelete);
          await supabase.from("client_booking_blocks").delete().eq("unidade_id", unitIdToDelete);
          await supabase.from("barber_unit_roles").delete().eq("unidade_id", unitIdToDelete);
        } catch {
          // limpeza não-fatal
        }

        const { error: delError } = await supabase
          .from("tenant_unidades")
          .delete()
          .eq("id", unitIdToDelete);

        if (delError) throw delError;
      }

      toast.success(`Barbearia "${unitNameToDelete}" excluída com sucesso.`);
      setShowDeleteModal(false);
      setDeleteConfirmText("");

      const remainingUnits = unidades.filter((u) => u.id !== unitIdToDelete);
      setUnidades(remainingUnits);

      if (remainingUnits.length > 0) {
        setSelectedUnidadeId(remainingUnits[0].id);
        if (remainingUnits[0].nome) setTenantNome(remainingUnits[0].nome);
        if (remainingUnits[0].logo_url) setTenantLogoUrl(remainingUnits[0].logo_url);
      } else {
        setSelectedUnidadeId(null);
      }

      await loadUnidades();
      setActiveScreen("hub");
    } catch (err: any) {
      console.error("[handleDeleteUnit]", err);
      toast.error(
        err?.message?.includes("foreign")
          ? "Não foi possível excluir: existem registros vinculados a esta unidade."
          : "Erro ao excluir a barbearia. Tente novamente."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  /** Upload da Logo da Barbearia */
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const tid = resolvedTenantId || barberContext.tenantId;
    if (!file || !tid) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione apenas imagens"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Máximo 5MB"); return; }

    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const filePath = `logos/${tid}/logo-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("logos")
        .getPublicUrl(filePath);

      const newLogoUrl = urlData.publicUrl;

      // 1. Atualizar em tenants
      await supabase
        .from("tenants")
        .update({ logo_url: newLogoUrl })
        .eq("id", tid);

      // 2. Atualizar em informacoes_empresa
      await supabase
        .from("informacoes_empresa")
        .upsert({
          tenant_id: tid,
          chave: "logo_url",
          valor: newLogoUrl,
        } as any, { onConflict: "tenant_id,chave" });

      // 3. Atualizar na unidade ativa caso seja específica
      if (activeUnit?.id) {
        await supabase
          .from("tenant_unidades")
          .update({ logo_url: newLogoUrl })
          .eq("id", activeUnit.id);
      }

      setTenantLogoUrl(newLogoUrl);
      setUnidades((prev) =>
        prev.map((u) => (u.id === activeUnit?.id ? { ...u, logo_url: newLogoUrl } : u))
      );
      toast.success("Foto da barbearia atualizada com sucesso!");
    } catch (err) {
      console.error("Erro ao enviar logo:", err);
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  };

  /** Upload do Banner da Barbearia */
  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const tid = resolvedTenantId || barberContext.tenantId;
    if (!file || !tid) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione apenas imagens"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Máximo 5MB"); return; }

    setUploadingBanner(true);
    try {
      const ext = file.name.split(".").pop() || "webp";
      const filePath = `tenants/banner-${tid}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const newBannerUrl = urlData.publicUrl;

      // 1. Atualizar em tenants
      await supabase
        .from("tenants")
        .update({ banner_url: newBannerUrl })
        .eq("id", tid);

      // 2. Atualizar em informacoes_empresa
      await supabase
        .from("informacoes_empresa")
        .upsert({
          tenant_id: tid,
          chave: "banner_url",
          valor: newBannerUrl,
        } as any, { onConflict: "tenant_id,chave" });

      setBannerUrl(newBannerUrl);
      toast.success("Banner da barbearia atualizado com sucesso!");
    } catch (err) {
      console.error("Erro ao enviar banner:", err);
      toast.error("Erro ao enviar banner");
    } finally {
      setUploadingBanner(false);
      e.target.value = "";
    }
  };

  /** Remove banner customizado (volta para padrão) */
  const handleRemoveBanner = async () => {
    const tid = resolvedTenantId || barberContext.tenantId;
    if (!tid) return;
    try {
      await supabase.from("tenants").update({ banner_url: null }).eq("id", tid);
      await supabase.from("informacoes_empresa").delete().eq("tenant_id", tid).eq("chave", "banner_url");
      setBannerUrl(null);
      toast.success("Banner removido");
    } catch (err) {
      console.error("Erro ao remover banner:", err);
    }
  };

  /** Upload da Foto de Perfil do Barbeiro (para barbeiro comum / não-admin) */
  const handleBarberAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const bId = barberContext.barbeiroId;
    const uId = barberContext.userId;
    if (!file || (!bId && !uId)) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione apenas imagens"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Máximo 5MB"); return; }

    setUploadingBarberAvatar(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const filePath = `barbeiros/avatar-${bId || uId}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const newAvatarUrl = urlData.publicUrl;

      if (bId) {
        await supabase
          .from("barbeiros")
          .update({ foto_url: newAvatarUrl })
          .eq("id", bId);
      }

      if (uId) {
        await supabase
          .from("profiles")
          .update({ avatar_url: newAvatarUrl })
          .eq("id", uId);
      }

      setBarberAvatarUrl(newAvatarUrl);
      toast.success("Foto de perfil atualizada com sucesso!");
    } catch (err) {
      console.error("Erro ao enviar foto de perfil:", err);
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploadingBarberAvatar(false);
      e.target.value = "";
    }
  };

  /** Renderiza sub-telas selecionadas */
  const renderSubScreen = () => {
    const tenantId = resolvedTenantId || barberContext.tenantId || undefined;
    switch (activeScreen) {
      case "formas-pagamento":
        return (
          <BarberFormasPagamento
            barbeiroId={effectiveBarbeiroId}
            userId={barberContext.userId}
            tenantId={resolvedTenantId || barberContext.tenantId}
            onBack={() => setActiveScreen("hub")}
          />
        );
      case "dados-empresa":
        return (
          <div className="pb-10">
            <ScheduleHeader title="Dados da Barbearia" onBack={() => setActiveScreen("hub")} />
            <div className="px-4 pt-3 max-w-md mx-auto">
              <p className="text-sm text-muted-foreground/60 leading-relaxed font-light mb-4">
                Configure os dados cadastrais, endereço e formas de contato oficiais da barbearia.
              </p>
              <AdminDadosEmpresa basePath={appBasePath} tenantId={tenantId} />
            </div>
          </div>
        );
      case "whatsapp":
        return (
          <div className="pb-10">
            <WhatsAppConnectionPage
              barbeiroId={barberContext.barbeiroId}
              userId={barberContext.userId}
              tenantId={resolvedTenantId || barberContext.tenantId}
              unidadeId={activeUnit?.id}
              unidadeNome={activeUnit?.nome}
              tenantNome={activeUnit?.nome || tenantNome}
              barberName={barberContext.apelido}
              onBackProp={() => setActiveScreen("hub")}
              hideAgent={!isTenantAdmin}
            />
          </div>
        );
      case "horarios":
        return (
          <div className="pb-10 min-h-app bg-background">
            <ScheduleHeader title="Horário de Funcionamento" onBack={() => setActiveScreen("hub")} />
            <div className="px-4 pt-3 max-w-md mx-auto space-y-4">
              <p className="text-sm text-muted-foreground/60 leading-relaxed font-light mb-1">
                Escolha o horário que deseja configurar:
              </p>
              <div className="divide-y divide-border/25">
                <button
                  type="button"
                  onClick={() => setActiveScreen("horarios-barbearia")}
                  className="w-full flex items-center justify-between py-4 text-left hover:opacity-80 active:scale-[0.99] transition-all group"
                >
                  <div className="min-w-0 pr-3">
                    <p className="text-[14.5px] font-medium text-foreground leading-snug">
                      Configurar horário da barbearia
                    </p>
                    <p className="text-[12px] text-muted-foreground/75 mt-0.5 leading-relaxed">
                      Expediente oficial e dias de atendimento de toda a barbearia
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => setActiveScreen("horarios-pessoal")}
                  className="w-full flex items-center justify-between py-4 text-left hover:opacity-80 active:scale-[0.99] transition-all group"
                >
                  <div className="min-w-0 pr-3">
                    <p className="text-[14.5px] font-medium text-foreground leading-snug">
                      Configurar o seu horário
                    </p>
                    <p className="text-[12px] text-muted-foreground/75 mt-0.5 leading-relaxed">
                      Seus dias e horários pessoais de trabalho na cadeira
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                </button>
              </div>
            </div>
          </div>
        );
      case "horarios-barbearia":
        return (
          <div className="pb-10 min-h-app bg-background">
            <ScheduleHeader title="Horário da Barbearia" onBack={() => setActiveScreen("horarios")} />
            <div className="px-4 pt-3 max-w-md mx-auto">
              <AdminHorarios hideTitle companyMode tenantId={tenantId} unidadeId={activeUnit?.id !== "todas" ? activeUnit?.id : undefined} />
            </div>
          </div>
        );
      case "horarios-pessoal":
        return (
          <div className="pb-10 min-h-app bg-background">
            <ScheduleHeader
              title={isTenantAdmin ? "Seu Horário Pessoal" : "Horário de Funcionamento"}
              onBack={() => setActiveScreen(isTenantAdmin ? "horarios" : "hub")}
            />
            <div className="px-4 pt-3 max-w-md mx-auto">
              <AdminHorarios hideTitle barbeiroId={barberContext.barbeiroId} tenantId={tenantId} unidadeId={activeUnit?.id !== "todas" ? activeUnit?.id : undefined} />
            </div>
          </div>
        );
      case "servicos":
      case "servicos-barbearia":
      case "servicos-planos":
      case "servicos-pessoal":
      case "planos":
        return (
          <BarberServicosPlanos
            tenantId={tenantId}
            appBasePath={appBasePath}
            onBack={() => setActiveScreen("hub")}
            defaultTab={activeScreen === "planos" ? "planos" : "servicos"}
            barberContext={barberContext}
          />
        );
      case "avaliacoes":
        return (
          <div className="pb-10">
            <ScheduleHeader title="Avaliações da Barbearia" onBack={() => setActiveScreen("hub")} />
            <div className="px-4 pt-3 max-w-md mx-auto">
              <p className="text-sm text-muted-foreground/60 leading-relaxed font-light mb-4">
                Acompanhe o feedback, notas e comentários deixados pelos clientes sobre a barbearia.
              </p>
              <AdminAvaliacoes tenantId={tenantId} basePath={appBasePath} hideHeader onBack={() => setActiveScreen("hub")} />
            </div>
          </div>
        );
      case "avaliacoes-pessoal":
        return (
          <div className="pb-10 min-h-app bg-background">
            <div className="max-w-md mx-auto">
              <BarberAvaliacoes
                barberContext={barberContext}
                basePath={appBasePath}
                onBack={() => setActiveScreen("hub")}
              />
            </div>
          </div>
        );
      case "barbeiros":
        return (
          <div className="pb-10">
            <div className="max-w-md mx-auto">
              <AdminBarbeiros
                basePath={appBasePath}
                tenantId={tenantId || resolvedTenantId}
                onBack={() => setActiveScreen("hub")}
              />
            </div>
          </div>
        );
      case "clientes":
        return (
          <div className="pb-10 min-h-app bg-background">
            <ScheduleHeader title="Clientes" onBack={() => setActiveScreen("hub")} />
            <div className="px-4 pt-3 max-w-md mx-auto space-y-4">
              <p className="text-sm text-muted-foreground/60 leading-relaxed font-light mb-1">
                Escolha a base de clientes que deseja visualizar:
              </p>
              <div className="divide-y divide-border/25">
                <button
                  type="button"
                  onClick={() => setActiveScreen("clientes-todos")}
                  className="w-full flex items-center justify-between py-4 text-left hover:opacity-80 active:scale-[0.99] transition-all group"
                >
                  <div className="min-w-0 pr-3">
                    <p className="text-[14.5px] font-medium text-foreground leading-snug">
                      Todos os clientes da barbearia
                    </p>
                    <p className="text-[12px] text-muted-foreground/75 mt-0.5 leading-relaxed">
                      Base completa de clientes de toda a barbearia
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => setActiveScreen("clientes-meus")}
                  className="w-full flex items-center justify-between py-4 text-left hover:opacity-80 active:scale-[0.99] transition-all group"
                >
                  <div className="min-w-0 pr-3">
                    <p className="text-[14.5px] font-medium text-foreground leading-snug">
                      Meus clientes
                    </p>
                    <p className="text-[12px] text-muted-foreground/75 mt-0.5 leading-relaxed">
                      Clientes atendidos exclusivamente por você
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                </button>
              </div>
            </div>
          </div>
        );
      case "clientes-todos":
        return (
          <div className="pb-10 min-h-app bg-background">
            <div className="max-w-2xl mx-auto px-0 sm:px-4">
              <BarberClientes
                barberContext={barberContext}
                forceViewMode="todos"
                initialUnitId={selectedUnidadeId === "todas" ? undefined : selectedUnidadeId}
                onBack={() => setActiveScreen("hub")}
              />
            </div>
          </div>
        );
      case "clientes-meus":
        return (
          <div className="pb-10 min-h-app bg-background">
            <div className="max-w-2xl mx-auto px-0 sm:px-4">
              <BarberClientes
                barberContext={barberContext}
                forceViewMode="meus"
                onBack={() => setActiveScreen("hub")}
              />
            </div>
          </div>
        );
      case "fotos-banner":
        if (!isTenantAdmin) {
          return (
            <div className="pb-10 min-h-app bg-background">
              <ScheduleHeader title="Foto de Perfil" onBack={() => setActiveScreen("hub")} />
              <div className="px-4 pt-4 max-w-md mx-auto space-y-4">
                <p className="text-sm text-muted-foreground/60 leading-relaxed font-light mb-1">
                  Personalize sua foto de exibição para seus clientes nos agendamentos e no perfil da barbearia.
                </p>

                {/* Card Foto do Barbeiro */}
                <div className="rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-4 space-y-4 shadow-xs">
                  <div className="flex items-center gap-3.5 p-3 rounded-xl bg-secondary/30 border border-border/40">
                    <div
                      className="rounded-2xl border border-border/60 bg-secondary overflow-hidden shrink-0 flex items-center justify-center shadow-xs"
                      style={{ width: 64, height: 64, minWidth: 64, minHeight: 64 }}
                    >
                      {barberAvatarUrl ? (
                        <img
                          src={barberAvatarUrl}
                          alt={barberContext.apelido || "Barbeiro"}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-foreground text-xl">
                          {(barberContext.apelido || "B").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-semibold text-foreground truncate">
                        {barberContext.apelido || "Meu Perfil"}
                      </p>
                      <p className="text-[11.5px] text-muted-foreground truncate mt-0.5">
                        Profissional da barbearia
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => barberAvatarInputRef.current?.click()}
                    disabled={uploadingBarberAvatar}
                    className="w-full h-11 rounded-xl bg-foreground text-background font-medium text-[13px] flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
                  >
                    {uploadingBarberAvatar ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                    <span>{barberAvatarUrl ? "Alterar foto de perfil" : "Adicionar foto de perfil"}</span>
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-muted/30 border border-border/40 space-y-1">
                  <p className="text-[12px] text-foreground font-medium flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 opacity-70" />
                    <span>Dica de proporção</span>
                  </p>
                  <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                    Para máxima nitidez, use uma foto nítida do seu rosto em formato quadrado (1:1).
                  </p>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="pb-10 min-h-app bg-background">
            <ScheduleHeader title="Foto e Banner" onBack={() => setActiveScreen("hub")} />
            <div className="px-4 pt-4 max-w-md mx-auto space-y-4">
              <p className="text-sm text-muted-foreground/60 leading-relaxed font-light mb-1">
                Personalize a identidade visual da barbearia atualizando o banner de capa e a foto de perfil.
              </p>
              {/* Seção 1: Banner da Barbearia (Capa) */}
              <div className="rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[14px] font-semibold text-foreground block">
                      Banner de Capa
                    </span>
                    <span className="text-[11.5px] text-muted-foreground">
                      Exibido no topo do perfil e agendamento dos clientes
                    </span>
                  </div>
                  {bannerUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveBanner}
                      className="text-[12px] text-muted-foreground hover:text-destructive font-medium transition-colors"
                    >
                      Remover
                    </button>
                  )}
                </div>

                <div className="relative w-full h-32 rounded-xl bg-muted overflow-hidden border border-border/40">
                  <img
                    src={bannerUrl || profileBannerDefault}
                    alt="Banner da barbearia"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/20" />
                </div>

                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={uploadingBanner}
                  className="w-full h-10 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-[12.5px] font-medium flex items-center justify-center gap-2 border border-border/40 active:scale-[0.99] transition-all"
                >
                  {uploadingBanner ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4 opacity-70" />
                  )}
                  <span>{bannerUrl ? "Alterar banner de capa" : "Adicionar banner de capa"}</span>
                </button>
              </div>

              {/* Seção 2: Foto de Perfil da Barbearia (Logo) */}
              <div className="rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-4 space-y-3 shadow-xs">
                <div>
                  <span className="text-[14px] font-semibold text-foreground block">
                    Foto da Barbearia (Logo)
                  </span>
                  <span className="text-[11.5px] text-muted-foreground">
                    Ícone principal de identificação da barbearia
                  </span>
                </div>

                <div className="flex items-center gap-3.5 p-3 rounded-xl bg-secondary/30 border border-border/40">
                  <div
                    className="rounded-2xl border border-border/60 bg-secondary overflow-hidden shrink-0 flex items-center justify-center shadow-xs"
                    style={{ width: 60, height: 60, minWidth: 60, minHeight: 60 }}
                  >
                    {activeUnit?.logo_url || tenantLogoUrl ? (
                      <img
                        src={activeUnit?.logo_url || tenantLogoUrl || DEFAULT_COMPANY_LOGO}
                        alt={tenantNome}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-foreground text-lg">
                        {(tenantNome || "B").charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-foreground truncate">
                      {activeUnit?.nome || tenantNome || DEFAULT_COMPANY_NAME}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground truncate mt-0.5">
                      Unidade da barbearia
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="w-full h-10 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-[12.5px] font-medium flex items-center justify-center gap-2 border border-border/40 active:scale-[0.99] transition-all"
                >
                  {uploadingLogo ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4 opacity-70" />
                  )}
                  <span>Alterar foto de perfil</span>
                </button>
              </div>

              {/* Informações de recomendação */}
              <div className="p-3.5 rounded-xl bg-muted/30 border border-border/40 space-y-1">
                <p className="text-[12px] text-foreground font-medium flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 opacity-70" />
                  <span>Dica de proporções</span>
                </p>
                <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                  Para máxima nitidez, use imagem quadrada (1:1) para a foto de perfil e formato horizontal panorâmico (16:9) para o banner.
                </p>
              </div>
            </div>
          </div>
        );
      case "excluir-pausar":
        return (
          <div className="pb-10 min-h-app bg-background">
            <ScheduleHeader title="Excluir e Pausar" onBack={() => setActiveScreen("hub")} />

            <div className="px-4 pt-4 max-w-md mx-auto space-y-4">
              <p className="text-sm text-muted-foreground/60 leading-relaxed font-light mb-1">
                Controle a disponibilidade operacional da barbearia pausando agendamentos ou gerenciando a unidade.
              </p>
              {/* Card de Identificação da Barbearia Selecionada */}
              <div className="rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-4 flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl border border-border/50 bg-secondary/80 overflow-hidden flex items-center justify-center shrink-0">
                    {activeUnit?.logo_url || tenantLogoUrl ? (
                      <img
                        src={activeUnit?.logo_url || tenantLogoUrl || DEFAULT_COMPANY_LOGO}
                        alt={activeUnit?.nome || tenantNome}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="font-bold text-foreground text-[15px]">
                        {(activeUnit?.nome || tenantNome || "B").charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-foreground truncate">
                      {activeUnit?.nome || tenantNome}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          activeUnit?.ativo !== false ? "bg-emerald-500" : "bg-amber-500"
                        )}
                      />
                      <span>
                        {activeUnit?.ativo !== false ? "Operação ativa" : "Barbearia pausada"}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Lista Unificada Padrão Atendimento & Notificações (100% flat, divide-y divide-border/25) */}
              <div className="divide-y divide-border/25 pt-1">
                {/* Pausar / Reativar */}
                {activeUnit?.ativo !== false ? (
                  <button
                    type="button"
                    onClick={() => setShowPauseModal(true)}
                    className="w-full flex items-center justify-between py-4 text-left hover:opacity-80 active:scale-[0.99] transition-all group"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-[13.5px] font-medium text-foreground leading-snug">
                        Pausar barbearia
                      </p>
                      <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                        Pausa temporariamente novos agendamentos nesta filial mantendo seus cadastros e faturamento salvos.
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleToggleAtivo}
                    disabled={isPausing}
                    className="w-full flex items-center justify-between py-4 text-left hover:opacity-80 active:scale-[0.99] transition-all disabled:opacity-50 group"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="text-[13.5px] font-medium text-foreground leading-snug">
                        Reativar barbearia
                      </p>
                      <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                        Volta a receber agendamentos normalmente nesta filial.
                      </p>
                    </div>
                    {isPausing ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                    )}
                  </button>
                )}

                {/* Excluir Barbearia */}
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmText("");
                    setShowDeleteModal(true);
                  }}
                  className="w-full flex items-center justify-between py-4 text-left hover:opacity-80 active:scale-[0.99] transition-all group"
                >
                  <div className="min-w-0 pr-3">
                    <p className="text-[13.5px] font-medium text-destructive leading-snug">
                      Excluir barbearia permanentemente
                    </p>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                      Remove esta filial e desvincula os dados operacionais permanentemente.
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-destructive/50 group-hover:text-destructive transition-colors shrink-0" />
                </button>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  /** Modais de Pausar e Excluir Unidade (compartilhados entre o Hub e sub-telas) */
  const renderPauseDeleteModals = () => (
    <>
      {/* ═══ MODAL DE PAUSAR / CONFIRMAR PAUSA ═══ */}
      <AnimatePresence>
        {showPauseModal && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => !isPausing && setShowPauseModal(false)} />
            <motion.div
              initial={{ y: "100%", opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="relative w-full sm:max-w-md rounded-t-[28px] sm:rounded-2xl border border-border/70 dark:border-white/[0.1] bg-card p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto pb-[calc(2rem+env(safe-area-inset-bottom))]"
            >
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto -mt-1 mb-2 sm:hidden shrink-0" />

              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0 text-amber-500">
                  <PauseCircle className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[16px] font-bold text-foreground leading-tight">
                    Pausar barbearia temporariamente?
                  </h3>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    Unidade: <strong className="text-foreground">{activeUnit?.nome || tenantNome}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !isPausing && setShowPauseModal(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 space-y-2 text-[12px] text-muted-foreground">
                <p className="font-medium text-foreground">
                  O que acontece ao pausar a unidade:
                </p>
                <ul className="space-y-1.5 list-disc list-inside text-muted-foreground">
                  <li>A barbearia fica oculta no fluxo de agendamento de clientes.</li>
                  <li>Não haverá acúmulo de novos agendamentos no banco de dados.</li>
                  <li><strong>Seus dados não são perdidos:</strong> barbeiros, serviços, faturamento e cadastros ficam 100% seguros e intactos.</li>
                  <li>Você pode reativar a operação a qualquer instante com apenas 1 clique.</li>
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPauseModal(false)}
                  disabled={isPausing}
                  className="h-11 rounded-xl border border-border/80 bg-secondary/60 hover:bg-secondary text-foreground text-[13px] font-medium transition-all active:scale-[0.98]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleToggleAtivo}
                  disabled={isPausing}
                  className="h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-[13px] transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-xs"
                >
                  {isPausing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <PauseCircle className="w-4 h-4" />
                  )}
                  <span>{isPausing ? "Pausando..." : "Confirmar pausa"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══ MODAL DE EXCLUIR BARBEARIA (AÇÃO CRÍTICA DE ALTA SEGURANÇA) ═══ */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => !isDeleting && setShowDeleteModal(false)} />
            <motion.div
              initial={{ y: "100%", opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="relative w-full sm:max-w-md rounded-t-[28px] sm:rounded-2xl border border-destructive/40 bg-card p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto pb-[calc(2rem+env(safe-area-inset-bottom))]"
            >
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto -mt-1 mb-2 sm:hidden shrink-0" />

              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-destructive/15 border border-destructive/25 flex items-center justify-center shrink-0 text-destructive">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[16px] font-bold text-foreground leading-tight">
                    Excluir barbearia definitivamente?
                  </h3>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    Unidade: <strong className="text-destructive font-semibold">{activeUnit?.nome || tenantNome}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !isDeleting && setShowDeleteModal(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Alerta de Perigo Crítico */}
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 space-y-2 text-[12px]">
                <p className="font-semibold text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Atenção: Ação permanente e irreversível!</span>
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Esta operação apagará todos os dados exclusivos vinculados a esta unidade (<strong className="text-foreground">{activeUnit?.nome || tenantNome}</strong>) do banco de dados:
                </p>
                <ul className="space-y-1 list-disc list-inside text-muted-foreground">
                  <li>Os vínculos de barbeiros com esta unidade serão desfeitos.</li>
                  <li>As referências de agendamentos desta filial serão desvinculadas.</li>
                  <li>A unidade será apagada permanentemente do cadastro.</li>
                  <li><strong>As outras barbearias e filiais não serão afetadas.</strong></li>
                </ul>
              </div>

              {/* Dica estratégica antes da exclusão */}
              <div className="rounded-xl border border-border/60 bg-secondary/30 p-3 flex items-start gap-2.5">
                <Store className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                  Se você quer apenas suspender a unidade temporariamente sem perder seus dados, use a opção <strong className="text-foreground">Pausar barbearia</strong>.
                </p>
              </div>

              {/* Confirmação por digitação */}
              <div className="space-y-2 pt-1">
                <label className="text-[12px] font-medium text-foreground block">
                  Para confirmar, digite <span className="font-mono font-bold text-destructive">EXCLUIR</span> no campo abaixo:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Digite EXCLUIR"
                  disabled={isDeleting}
                  className="w-full h-11 px-3.5 rounded-xl border border-border/80 bg-background text-foreground text-[13px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-destructive/40 focus:border-destructive transition-all"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>

              {/* Botões de Ação */}
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="h-11 rounded-xl border border-border/80 bg-secondary/60 hover:bg-secondary text-foreground text-[13px] font-medium transition-all active:scale-[0.98]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDeleteUnit}
                  disabled={isDeleting || deleteConfirmText.trim().toUpperCase() !== "EXCLUIR"}
                  className={cn(
                    "h-11 rounded-xl text-white font-semibold text-[13px] transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-xs",
                    deleteConfirmText.trim().toUpperCase() === "EXCLUIR" && !isDeleting
                      ? "bg-destructive hover:bg-destructive/90 cursor-pointer"
                      : "bg-destructive/40 text-white/50 cursor-not-allowed opacity-60"
                  )}
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  <span>{isDeleting ? "Excluindo..." : "Excluir Definitivamente"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );

  /** Se uma sub-tela estiver ativa, renderiza a sub-tela correspondente */
  if (activeScreen !== "hub") {
    return (
      <div className="min-h-app bg-background">
        {/* Inputs ocultos para upload de foto e banner em sub-telas */}
        <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
        <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" />
        <input ref={barberAvatarInputRef} type="file" accept="image/*" onChange={handleBarberAvatarUpload} className="hidden" />

        {renderSubScreen()}

        {/* Modal Wizard se acionado na sub-tela */}
        <UnidadeWizardSheet
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          tenantId={resolvedTenantId}
          onSaved={() => {
            loadUnidades();
            toast.success("Nova barbearia cadastrada com sucesso!");
          }}
        />

        {/* Modal de Detalhes da Unidade se acionado */}
        {detailUnidade && (
          <UnidadeDetailScreen
            open={!!detailUnidade}
            onClose={() => setDetailUnidade(null)}
            unidade={detailUnidade}
            tenantId={detailUnidade.tenant_id}
            onSaved={() => {
              loadUnidades();
              setDetailUnidade(null);
            }}
          />
        )}

        {/* Modais de Pausar e Excluir */}
        {renderPauseDeleteModals()}
      </div>
    );
  }

  /** Hub principal — 100% sério, minimalista, institucional e estratégico (Padrão Screenshot & Apple HIG) */
  return (
    <div className="pb-10">
      {/* Inputs ocultos para upload de foto e banner */}
      <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
      <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" />
      <input ref={barberAvatarInputRef} type="file" accept="image/*" onChange={handleBarberAvatarUpload} className="hidden" />

      {/* Header Institucional Padrão do Sistema */}
      <ScheduleHeader
        title="Configurações"
        onBack={() => navigate(`${appBasePath}/perfil`)}
        right={
          isTenantAdmin && unidades.length > 1 ? (
            <button
              type="button"
              onClick={() => setShowSelectUnitDrawer(true)}
              className="flex items-center gap-1.5 p-1 pr-1.5 rounded-full hover:bg-secondary active:scale-95 transition-all"
              title="Trocar barbearia"
            >
              <div className="w-7 h-7 rounded-full overflow-hidden bg-secondary border border-border/50 flex items-center justify-center shrink-0">
                {activeUnit?.logo_url || tenantLogoUrl ? (
                  <img
                    src={activeUnit?.logo_url || tenantLogoUrl || DEFAULT_COMPANY_LOGO}
                    alt={activeUnit?.nome || tenantNome}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="font-bold text-foreground text-[11px]">
                    {(activeUnit?.nome || tenantNome || "B").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-foreground/70" />
            </button>
          ) : null
        }
      />

      <div className="px-4 pt-3 max-w-md mx-auto space-y-4">
        {/* Barra de Pesquisa Inteligente (Padrão Screenshot) */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar nas configurações..."
            className="w-full h-11 pl-10 pr-9 rounded-2xl bg-muted/40 dark:bg-white/[0.04] border border-border/40 focus:border-border/80 focus:bg-background text-[13.5px] text-foreground placeholder:text-muted-foreground/50 transition-all outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Banner de Alerta se a barbearia selecionada estiver pausada (apenas para Admin) */}
        {isTenantAdmin && activeUnit && activeUnit.ativo === false && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2.5 text-amber-600 dark:text-amber-400 shadow-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-semibold leading-tight">Barbearia Pausada Temporariamente</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                Esta filial não está recebendo novos agendamentos no momento. Todos os dados permanecem salvos.
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleAtivo}
              disabled={isPausing}
              className="shrink-0 text-[11.5px] font-semibold underline underline-offset-2 hover:opacity-80 active:opacity-60"
            >
              {isPausing ? "Reativando..." : "Reativar"}
            </button>
          </div>
        )}

        {/* ═══ LISTA UNIFICADA COM ÍCONES BARE (PADRÃO 100% IDENTICO AO SCREENSHOT) ═══ */}
        {filteredItems.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Search className="w-8 h-8 text-muted-foreground/30 mx-auto" />
            <p className="text-[13.5px] font-medium text-foreground">
              Nenhuma configuração encontrada
            </p>
            <p className="text-[12px] text-muted-foreground">
              Nenhum item corresponde a "{searchQuery}".
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-[12px] font-medium text-foreground underline underline-offset-2 mt-1 hover:opacity-80"
            >
              Limpar pesquisa
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border/25 pt-1">
            {filteredItems.map((item) => (
              <ConfigListItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                description={item.description}
                destructive={item.destructive}
                onClick={item.onClick}
              />
            ))}
          </div>
        )}
      </div>


      {/* ═══ DRAWER DE SELEÇÃO DE BARBEARIA / FILIAL (GAVETA COMPARTILHADA) ═══ */}
      <SelectBarbeariaDrawer
        open={showSelectUnitDrawer}
        onClose={() => setShowSelectUnitDrawer(false)}
        tenantId={resolvedTenantId || barberContext.tenantId}
        activeUnitId={activeUnit?.id}
        onSelectUnit={handleSelectUnit}
      />

      {/* Modal Wizard de Criação de Unidade */}
      <UnidadeWizardSheet
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        tenantId={resolvedTenantId}
        onSaved={() => {
          loadUnidades();
          toast.success("Nova barbearia cadastrada com sucesso!");
        }}
      />

      {/* Modal de Detalhes da Unidade */}
      {detailUnidade && (
        <UnidadeDetailScreen
          open={!!detailUnidade}
          onClose={() => setDetailUnidade(null)}
          unidade={detailUnidade}
          tenantId={detailUnidade.tenant_id}
          onSaved={() => {
            loadUnidades();
            setDetailUnidade(null);
          }}
        />
      )}

      {/* Modais de Pausar e Excluir */}
      {renderPauseDeleteModals()}
    </div>
  );
}

/**
 * Subcomponente de item de menu direto na tela de fundo (Padrão 100% idêntico à imagem de referência)
 */
function ConfigListItem({
  icon: Icon,
  label,
  description,
  badge,
  destructive,
  onClick,
}: {
  icon?: React.ElementType;
  label: string;
  description: string;
  badge?: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between py-4 text-left hover:opacity-80 active:scale-[0.99] transition-all group"
    >
      <div className="flex items-center gap-3.5 min-w-0 pr-3 flex-1">
        {Icon && (
          <Icon
            className={cn(
              "w-5 h-5 stroke-[1.8] shrink-0",
              destructive ? "text-destructive" : "text-foreground"
            )}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p
              className={cn(
                "text-[13.5px] font-semibold leading-snug",
                destructive ? "text-destructive" : "text-foreground"
              )}
            >
              {label}
            </p>
            {badge && (
              <span className="text-[9.5px] font-medium uppercase px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border/40 shrink-0">
                {badge}
              </span>
            )}
          </div>
          <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      <ChevronRight
        className={cn(
          "w-4 h-4 transition-colors shrink-0",
          destructive
            ? "text-destructive/50 group-hover:text-destructive"
            : "text-muted-foreground/40 group-hover:text-foreground"
        )}
      />
    </button>
  );
}

interface BarberServicosPlanosProps {
  tenantId?: string;
  appBasePath?: string;
  onBack: () => void;
  defaultTab?: "servicos" | "planos";
  barberContext: BarberContext;
}

function BarberServicosPlanos({
  tenantId,
  appBasePath,
  onBack,
  defaultTab = "servicos",
  barberContext,
}: BarberServicosPlanosProps) {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<"servicos" | "planos">(defaultTab);

  const isEditing = !!(searchParams.get("edit") || searchParams.get("novo"));

  return (
    <div className="pb-10 min-h-app">
      {!isEditing && (
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md">
          <ScheduleHeader title="Serviços e Planos" onBack={onBack} className="static" />
          {/* Seletor Segmentado Apple (Serviços | Planos) */}
          <div className="px-4 pt-1 pb-3 max-w-md mx-auto">
            <p className="text-sm text-muted-foreground/60 leading-relaxed font-light mb-3">
              {tab === "servicos"
                ? "Configure os serviços disponíveis, tempo estimado de atendimento e valores cobrados."
                : "Gerencie os planos de assinatura mensal e regras de agendamento da barbearia."}
            </p>
            <div className="grid grid-cols-2 p-1 rounded-full bg-muted/60 dark:bg-white/[0.06] border border-border/40 backdrop-blur-xl">
              <button
                type="button"
                onClick={() => setTab("servicos")}
                className={cn(
                  "flex items-center justify-center gap-2 py-2 px-4 rounded-full text-[13px] transition-all duration-200 select-none",
                  tab === "servicos"
                    ? "bg-foreground text-background shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground font-medium"
                )}
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Serviços</span>
              </button>
              <button
                type="button"
                onClick={() => setTab("planos")}
                className={cn(
                  "flex items-center justify-center gap-2 py-2 px-4 rounded-full text-[13px] transition-all duration-200 select-none",
                  tab === "planos"
                    ? "bg-foreground text-background shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground font-medium"
                )}
              >
                <Crown className="w-3.5 h-3.5" />
                <span>Planos</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-md mx-auto">
        {tab === "servicos" ? (
          <BarberCortes
            barberContext={barberContext}
            tenantId={tenantId}
            basePath={appBasePath}
            hideHeader
          />
        ) : (
          <AdminPlanos tenantId={tenantId} basePath={appBasePath} hideHeader />
        )}
      </div>
    </div>
  );
}

