import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock, Users, ChevronRight, ChevronLeft,
  Building2, Scissors, Package, MessageSquare,
  UserCheck, Camera, ImagePlus, Loader2, Star, CreditCard, ShoppingBag,
  Plus, Search, Store, MapPin, Phone, Check,
} from "lucide-react";
import { BarberContext } from "@/pages/Barbeiro";
import AdminHorarios from "@/components/admin/AdminHorarios";
import { AdminPlanos } from "@/components/admin/AdminPlanos";
import { BarberClientes } from "@/components/barber/BarberClientes";
import { AdminCortes } from "@/components/admin/AdminCortes";
import { AdminBarbeiros } from "@/components/admin/AdminBarbeiros";
import { AdminDadosEmpresa } from "@/components/admin/AdminDadosEmpresa";
import { AdminAvaliacoes } from "@/components/admin/AdminAvaliacoes";
import { WhatsAppConnectionPage } from "@/components/whatsapp/WhatsAppConnectionPage";
import { UnidadeWizardSheet } from "@/components/admin/unidades/wizard/UnidadeWizardSheet";
import { UnidadeDetailScreen } from "@/components/admin/unidades/UnidadeDetailScreen";
import type { Unidade } from "@/components/admin/unidades/AdminUnidades";

import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import profileBannerDefault from "@/assets/profile-banner-default.jpg";
import { useStatusBarColor } from "@/hooks/useStatusBarColor";
import { resolveOldestOwnedTenant } from "@/lib/tenantOwnership";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Hub de Configurações da Barbearia — exclusivo do Administrador / Dono.
 * 100% sério, minimalista e estratégico:
 *   - Banner no topo edge-to-edge com a setinha curvada padrão do sistema sobre o banner
 *   - Botão de trocar banner sobre o banner
 *   - Carrossel horizontal de perfis das Barbearias (unidades) sobrepondo 50/50 o banner:
 *       • Até 6 unidades exibidas diretamente no carrossel
 *       • Botão circular com "+" ao lado da foto para cadastrar nova unidade (abre o wizard)
 *       • Opção "Ver todas" caso tenha mais unidades (abre tela inteira com barra de pesquisa)
 *       • Ao arrastar/trocar de unidade no carrossel, atualiza dinamicamente todos os dados da barbearia
 *   - Logo e nome da barbearia garantidos com fallback em "Barbearia DUB" e logo oficial
 *   - 4 Cards estratégicos principais com efeito watermark (Barbeiros, Serviços, Horários, Clientes)
 *   - Lista minimalista sem fundos de ícones (Dados da Barbearia, Planos, Avaliações, Pagamento, Loja)
 */

type HubScreen =
  | "hub"
  | "dados-empresa"
  | "whatsapp"
  | "horarios"
  | "servicos"
  | "planos"
  | "formas-pagamento"
  | "loja"
  | "avaliacoes"
  | "barbeiros"
  | "clientes"
  | "todas-unidades";

interface HubSection {
  label: string;
  items: HubItem[];
}

interface HubItem {
  key: HubScreen;
  icon: React.ElementType;
  title: string;
  description: string;
  badge?: string;
}

const hubSections: HubSection[] = [
  {
    label: "Configurações da Empresa",
    items: [
      {
        key: "dados-empresa",
        icon: Building2,
        title: "Dados da Barbearia",
        description: "Nome, WhatsApp, endereço e redes sociais",
      },
      {
        key: "whatsapp",
        icon: MessageSquare,
        title: "WhatsApp da Barbearia",
        description: "Instância, agente e notificações desta unidade",
      },
      {
        key: "clientes",
        icon: Users,
        title: "Clientes da Barbearia",
        description: "Base de contatos, histórico e fidelidade",
      },
      {
        key: "avaliacoes",
        icon: Star,
        title: "Avaliações da Barbearia",
        description: "Feedbacks e notas dos clientes sobre a barbearia",
      },
    ],
  },
  {
    label: "Comercial & Financeiro",
    items: [
      {
        key: "formas-pagamento",
        icon: CreditCard,
        title: "Formas de Pagamento",
        description: "PIX, cartões e dinheiro aceitos na barbearia",
        badge: "Em manutenção",
      },
      {
        key: "loja",
        icon: ShoppingBag,
        title: "Loja de Produtos",
        description: "Catálogo de pomadas, cosméticos e controle de estoque",
        badge: "Em manutenção",
      },
    ],
  },
];

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
  const [activeScreen, setActiveScreen] = useState<HubScreen>("hub");
  const [tenantNome, setTenantNome] = useState<string>(DEFAULT_COMPANY_NAME);
  const [tenantLogoUrl, setTenantLogoUrl] = useState<string | null>(DEFAULT_COMPANY_LOGO);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(barberContext.tenantId || null);

  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Unidades da Barbearia
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [selectedUnidadeId, setSelectedUnidadeId] = useState<string>("todas");
  const [activeUnitIndex, setActiveUnitIndex] = useState<number>(0);
  const [activeCarouselIndex, setActiveCarouselIndex] = useState<number>(0);
  const [loadingUnidades, setLoadingUnidades] = useState(true);

  // Modais de Criação e Detalhes de Unidade
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailUnidade, setDetailUnidade] = useState<Unidade | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Referência do carrossel horizontal de unidades
  const carouselRef = useRef<HTMLDivElement>(null);

  // Lista de itens do carrossel: unidades + botão de adicionar
  const carouselItems = useMemo(() => {
    return [
      ...unidades.map((u, i) => ({ type: "unit" as const, unit: u, id: u.id, index: i })),
      { type: "add" as const, id: "add-new-unit", index: unidades.length },
    ];
  }, [unidades]);

  useStatusBarColor("app-background");

  /** Busca dados gerais do tenant e da Barbearia DUB */
  useEffect(() => {
    let mounted = true;
    (async () => {
      let resolvedName = "";
      let resolvedLogo: string | null = null;
      let resolvedBanner: string | null = null;
      let tId = barberContext.tenantId || resolvedTenantId;

      // 1. Buscar em informacoes_empresa (onde Barbearia DUB e logo estão salvos)
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
            .select("id, nome, banner_url, logo_url")
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
      if ((!resolvedLogo || !resolvedName) && barberContext.barbeiroId) {
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
      if (!resolvedLogo || !resolvedName) {
        try {
          const { data: ownerTenant } = await resolveOldestOwnedTenant<{ id: string; nome: string; banner_url?: string; logo_url?: string }>(
            barberContext.userId,
            "id, nome, banner_url, logo_url"
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

      // 5. Banner RPC fallback
      try {
        if (!resolvedBanner && barberContext.barbeiroId) {
          const { data } = await supabase.rpc("get_admin_banner_for_barber", {
            p_barbeiro_id: barberContext.barbeiroId,
          });
          if (data) resolvedBanner = data as string;
        }
      } catch {}

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
        .select("id, tenant_id, nome, slogan, logo_url, is_sede, ativo, rua, numero, complemento, bairro, cidade, estado, telefone, whatsapp, cep, cnpj, cpf, email, site, slug, created_at")
        .eq("ativo", true);

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

        // Se nenhuma unidade selecionada ou selecionada for "todas", ativa a primeira
        if (selectedUnidadeId === "todas" || !selectedUnidadeId) {
          setSelectedUnidadeId(mapped[0].id);
          setActiveUnitIndex(0);
          setActiveCarouselIndex(0);
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
        setActiveUnitIndex(0);
        setActiveCarouselIndex(0);
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

  /** Sincroniza o carrossel durante o scroll no dedo */
  const handleCarouselScroll = () => {
    if (!carouselRef.current) return;
    const container = carouselRef.current;
    const center = container.scrollLeft + container.clientWidth / 2;
    const children = Array.from(container.children) as HTMLElement[];
    let closestIndex = 0;
    let minDistance = Infinity;

    children.forEach((child, i) => {
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const distance = Math.abs(center - childCenter);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    });

    if (closestIndex !== activeCarouselIndex) {
      setActiveCarouselIndex(closestIndex);
      if (closestIndex < unidades.length) {
        const u = unidades[closestIndex];
        setSelectedUnidadeId(u.id);
        setActiveUnitIndex(closestIndex);
        setTenantNome(u.nome || DEFAULT_COMPANY_NAME);
        setTenantLogoUrl(u.logo_url || DEFAULT_COMPANY_LOGO);
        if (u.tenant_id) setResolvedTenantId(u.tenant_id);
      }
    }
  };

  /** Centraliza o círculo selecionado e atualiza a unidade ativa */
  const handleSelectCircle = (index: number) => {
    if (!carouselRef.current) return;
    const child = carouselRef.current.children[index] as HTMLElement;
    if (child) {
      child.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
    setActiveCarouselIndex(index);
    if (index < unidades.length) {
      const u = unidades[index];
      setSelectedUnidadeId(u.id);
      setActiveUnitIndex(index);
      setTenantNome(u.nome || DEFAULT_COMPANY_NAME);
      setTenantLogoUrl(u.logo_url || DEFAULT_COMPANY_LOGO);
      if (u.tenant_id) setResolvedTenantId(u.tenant_id);
    } else {
      if (activeCarouselIndex === index) {
        setWizardOpen(true);
      }
    }
  };

  /** Unidade atualmente ativa em exibição */
  const activeUnit = useMemo(() => {
    return unidades.find((u) => u.id === selectedUnidadeId) || unidades[activeUnitIndex] || unidades[0];
  }, [unidades, selectedUnidadeId, activeUnitIndex]);

  /** Unidades filtradas pela barra de pesquisa */
  const filteredUnidades = useMemo(() => {
    if (!searchTerm.trim()) return unidades;
    const term = searchTerm.toLowerCase();
    return unidades.filter(
      (u) =>
        u.nome?.toLowerCase().includes(term) ||
        u.bairro?.toLowerCase().includes(term) ||
        u.cidade?.toLowerCase().includes(term) ||
        u.rua?.toLowerCase().includes(term) ||
        u.telefone?.includes(term)
    );
  }, [unidades, searchTerm]);

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

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;

      await supabase.from("tenants").update({ banner_url: publicUrl }).eq("id", tid);
      setBannerUrl(publicUrl);
      toast.success("Banner da barbearia atualizado!");
    } catch (err) {
      console.error("Erro ao enviar banner:", err);
      toast.error("Erro ao atualizar banner da barbearia");
    } finally {
      setUploadingBanner(false);
      e.target.value = "";
    }
  };

  /** Upload do Logo / Foto de Perfil da Barbearia Ativa */
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const tid = resolvedTenantId || barberContext.tenantId;
    if (!file || !tid) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione apenas imagens"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Máximo 5MB"); return; }

    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop() || "webp";
      const filePath = `tenants/logo-${tid}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;

      // Atualiza no tenant e na unidade ativa
      await supabase.from("tenants").update({ logo_url: publicUrl }).eq("id", tid);
      if (activeUnit?.id) {
        await supabase.from("tenant_unidades").update({ logo_url: publicUrl }).eq("id", activeUnit.id);
      }
      setTenantLogoUrl(publicUrl);
      // Atualiza também na lista local de unidades
      setUnidades((prev) =>
        prev.map((u) => (u.id === activeUnit?.id ? { ...u, logo_url: publicUrl } : u))
      );
      toast.success("Logo da barbearia atualizado!");
    } catch (err) {
      console.error("Erro ao enviar logo:", err);
      toast.error("Erro ao atualizar logo da barbearia");
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  };

  /** Setinha de voltar — padrão tradicional em V do sistema (ChevronLeft com traço 2.2) */
  const BackArrow = ({ className = "" }: { className?: string }) => (
    <ChevronLeft className={cn("w-5 h-5 stroke-[2.2]", className)} />
  );

  /** Renderiza sub-telas selecionadas */
  const renderSubScreen = () => {
    const tenantId = resolvedTenantId || barberContext.tenantId || undefined;
    switch (activeScreen) {
      case "todas-unidades":
        return (
          <div className="min-h-[var(--app-height,100dvh)] bg-background px-4 py-3 max-w-xl mx-auto pb-24">
            {/* Header da tela todas as unidades */}
            <div className="flex items-center justify-between gap-3 mb-5 pt-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveScreen("hub")}
                  className="w-9 h-9 rounded-full bg-secondary text-foreground flex items-center justify-center hover:bg-secondary/80 active:scale-95 transition-all shadow-xs"
                  aria-label="Voltar para configurações"
                >
                  <BackArrow />
                </button>
                <div>
                  <h1 className="text-[19px] font-bold text-foreground leading-tight">
                    Todas as Barbearias
                  </h1>
                  <p className="text-[12px] text-muted-foreground">
                    {unidades.length} {unidades.length === 1 ? "unidade cadastrada" : "unidades cadastradas"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setWizardOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-foreground text-background text-xs font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Nova Unidade</span>
              </button>
            </div>

            {/* Barra de pesquisa */}
            <div className="relative mb-4">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Pesquisar por nome, bairro, cidade..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border/70 text-foreground text-[13px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
              />
            </div>

            {/* Lista de cards das unidades */}
            <div className="space-y-3">
              {filteredUnidades.map((u, idx) => {
                const isCurrentActive = selectedUnidadeId === u.id || (selectedUnidadeId === "todas" && idx === 0);
                const logo = u.logo_url || tenantLogoUrl || DEFAULT_COMPANY_LOGO;

                return (
                  <div
                    key={u.id}
                    className={cn(
                      "p-4 rounded-2xl bg-card border transition-all flex flex-col gap-3 shadow-xs",
                      isCurrentActive ? "border-primary/60 ring-1 ring-primary/40" : "border-border/60 hover:border-foreground/30"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-12 w-12 rounded-xl border border-border/50 shrink-0 overflow-hidden bg-secondary flex items-center justify-center"
                          style={{ width: 48, height: 48, minWidth: 48, minHeight: 48 }}
                        >
                          {logo ? (
                            <img src={logo} alt={u.nome} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-foreground font-bold text-base">
                              {(u.nome || "B").charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-[15px] font-bold text-foreground">
                              {u.nome}
                            </h3>
                            {u.is_sede && (
                              <span className="text-[9.5px] uppercase font-semibold px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border/40">
                                Sede
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />
                            <span className="truncate">
                              {[u.rua, u.numero, u.bairro, u.cidade].filter(Boolean).join(", ") || "Endereço não informado"}
                            </span>
                          </p>
                          {u.telefone && (
                            <p className="text-[11.5px] text-muted-foreground/80 flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3 shrink-0" />
                              <span>{u.telefone}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/30">
                      <button
                        type="button"
                        onClick={() => setDetailUnidade(u)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/60 hover:bg-secondary transition-colors"
                      >
                        Editar dados
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectCircle(idx);
                          setActiveScreen("hub");
                        }}
                        className={cn(
                          "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                          isCurrentActive
                            ? "bg-secondary text-foreground border border-border/80"
                            : "bg-foreground text-background hover:bg-foreground/90 active:scale-95"
                        )}
                      >
                        {isCurrentActive ? "Em gerenciamento" : "Gerenciar"}
                      </button>
                    </div>
                  </div>
                );
              })}

              {filteredUnidades.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Store className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm font-medium text-foreground">Nenhuma barbearia encontrada</p>
                  <p className="text-xs mt-1">Tente pesquisar por outro termo ou cadastre uma nova unidade.</p>
                </div>
              )}
            </div>
          </div>
        );
      case "dados-empresa":
        return <AdminDadosEmpresa basePath={appBasePath} tenantId={tenantId} />;
      case "whatsapp":
        return (
          <div className="pb-10 -mx-3 -mt-2">
            <div className="px-4 py-3 flex items-center gap-3 border-b border-border/40 mb-3 bg-background sticky top-0 z-30">
              <button
                type="button"
                onClick={() => setActiveScreen("hub")}
                className="w-9 h-9 rounded-full bg-secondary text-foreground flex items-center justify-center hover:bg-secondary/80 active:scale-95 transition-all shadow-xs"
                aria-label="Voltar para configurações"
              >
                <BackArrow />
              </button>
              <div>
                <h1 className="text-[17px] font-bold text-foreground leading-tight">
                  WhatsApp
                </h1>
                <p className="text-[12px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <Store className="w-3.5 h-3.5 text-muted-foreground/70" />
                  <span>{activeUnit?.nome || tenantNome}</span>
                </p>
              </div>
            </div>
            <WhatsAppConnectionPage
              hideHeader
              barbeiroId={barberContext.barbeiroId}
              userId={barberContext.userId}
              tenantId={resolvedTenantId || barberContext.tenantId}
              unidadeId={activeUnit?.id}
              unidadeNome={activeUnit?.nome}
              tenantNome={activeUnit?.nome || tenantNome}
              barberName={barberContext.apelido}
              onUnitChange={(newId) => {
                setSelectedUnidadeId(newId);
                const found = unidades.find((u) => u.id === newId);
                if (found) {
                  setTenantNome(found.nome || DEFAULT_COMPANY_NAME);
                  setTenantLogoUrl(found.logo_url || DEFAULT_COMPANY_LOGO);
                }
              }}
            />
          </div>
        );
      case "horarios":
        return (
          <div className="px-4 py-2">
            <AdminHorarios hideTitle companyMode tenantId={tenantId} />
          </div>
        );
      case "servicos":
        return <AdminCortes tenantId={tenantId} basePath={appBasePath} hideHeader />;
      case "planos":
        return <AdminPlanos tenantId={tenantId} basePath={appBasePath} hideHeader />;
      case "avaliacoes":
        return <AdminAvaliacoes tenantId={tenantId} basePath={appBasePath} hideHeader onBack={() => setActiveScreen("hub")} />;
      case "barbeiros":
        return <AdminBarbeiros basePath={appBasePath} hideHeader onBack={() => setActiveScreen("hub")} />;
      case "clientes":
        return (
          <BarberClientes
            barberContext={barberContext}
            forceViewMode="todos"
            initialUnitId={selectedUnidadeId === "todas" ? undefined : selectedUnidadeId}
            hideHeader
          />
        );
      case "formas-pagamento":
        return (
          <div className="flex flex-col items-center justify-center text-center px-6 py-16 max-w-md mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-foreground/[0.05] dark:bg-white/[0.06] text-foreground flex items-center justify-center mb-4">
              <CreditCard className="w-7 h-7 stroke-[1.7]" />
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border/40 mb-3">
              Em manutenção
            </span>
            <h2 className="text-[18px] font-bold text-foreground mb-2">Formas de Pagamento</h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed mb-6">
              Em breve você poderá configurar diretamente as formas de recebimento aceitas na sua barbearia (PIX, Cartão e Dinheiro) com regras de taxas e repasses.
            </p>
            <button
              onClick={() => setActiveScreen("hub")}
              className="px-5 py-2.5 rounded-xl bg-secondary text-foreground text-[13px] font-medium hover:bg-secondary/80 active:scale-95 transition-all"
            >
              Voltar para configurações
            </button>
          </div>
        );
      case "loja":
        return (
          <div className="flex flex-col items-center justify-center text-center px-6 py-16 max-w-md mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-foreground/[0.05] dark:bg-white/[0.06] text-foreground flex items-center justify-center mb-4">
              <ShoppingBag className="w-7 h-7 stroke-[1.7]" />
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border/40 mb-3">
              Em manutenção
            </span>
            <h2 className="text-[18px] font-bold text-foreground mb-2">Loja de Produtos</h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed mb-6">
              O catálogo de produtos para venda no balcão (pomadas, óleos para barba e cosméticos) com controle de estoque e comissão está sendo preparado.
            </p>
            <button
              onClick={() => setActiveScreen("hub")}
              className="px-5 py-2.5 rounded-xl bg-secondary text-foreground text-[13px] font-medium hover:bg-secondary/80 active:scale-95 transition-all"
            >
              Voltar para configurações
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  /** Hub principal — 100% sério, minimalista e estratégico */
  if (activeScreen === "hub") {
    return (
      <div className="min-h-[var(--app-height,100dvh)] bg-background pb-28 -mx-3 sm:-mx-4 -mt-2">
        {/* Inputs de arquivo ocultos para upload */}
        <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" />
        <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />

        {/* ═══ BANNER DA BARBEARIA (edge-to-edge) COM SETINHA E BOTÃO SOBREPOSTOS ═══ */}
        <div className="relative isolate bg-background">
          <div
            className="relative w-full overflow-hidden bg-muted h-44 sm:h-52"
            style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
          >
            {bannerUrl ? (
              <img
                src={bannerUrl}
                alt="Banner da barbearia"
                className="w-full h-full object-cover"
                style={{ objectPosition: "center" }}
              />
            ) : (
              <img
                src={profileBannerDefault}
                alt="Banner padrão"
                className="w-full h-full object-cover"
                style={{ objectPosition: "center" }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/15 to-background" />

            {/* Setinha padrão do sistema (em V) SOBRE o banner */}
            <button
              type="button"
              onClick={() => navigate(`${appBasePath}/perfil`)}
              aria-label="Voltar para perfil"
              className="absolute left-4 z-20 w-9 h-9 rounded-full bg-black/50 backdrop-blur-md text-white border border-white/10 flex items-center justify-center hover:bg-black/70 active:scale-95 transition-all shadow-lg"
              style={{ top: "calc(0.75rem + var(--app-safe-top, env(safe-area-inset-top, 0px)))" }}
            >
              <BackArrow />
            </button>

            {/* Botão Trocar banner SOBRE o banner */}
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              disabled={uploadingBanner}
              className="absolute right-4 z-20 h-8 px-3 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white/95 hover:bg-black/70 active:scale-95 transition-all flex items-center gap-1.5 shadow-lg"
              style={{ top: "calc(0.75rem + var(--app-safe-top, env(safe-area-inset-top, 0px)))" }}
              aria-label="Trocar banner da barbearia"
            >
              {uploadingBanner ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" />
              )}
              <span className="text-[11.5px] font-medium">Trocar banner</span>
            </button>
          </div>
        </div>

        {/* ═══ CARROSSEL DE CÍRCULOS DAS BARBEARIAS (SOBREPOSTO AO BANNER) ═══ */}
        <div className="relative px-0 pt-0 pb-1 -mt-12 sm:-mt-14 flex flex-col items-center select-none overflow-hidden z-10">
          <div
            ref={carouselRef}
            onScroll={handleCarouselScroll}
            className="flex items-center gap-3 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory px-[calc(50%-55px)] py-2 touch-pan-x select-none w-full"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {carouselItems.map((item, index) => {
              const isSelected = activeCarouselIndex === index;

              if (item.type === "unit") {
                const u = item.unit;
                const uLogo = u.logo_url || tenantLogoUrl || DEFAULT_COMPANY_LOGO;

                return (
                  <div
                    key={u.id}
                    onClick={() => handleSelectCircle(index)}
                    className="relative w-[110px] h-[110px] shrink-0 snap-center flex items-center justify-center cursor-pointer select-none"
                  >
                    <div className="relative">
                      <div
                        className={cn(
                          "rounded-full overflow-hidden transition-all duration-200 flex items-center justify-center shrink-0",
                          isSelected
                            ? "w-[96px] h-[96px] border-[3.5px] border-background bg-secondary shadow-xl ring-2 ring-foreground/15 scale-100"
                            : "w-[72px] h-[72px] border-2 border-background bg-secondary shadow-xs opacity-50 scale-95 hover:opacity-80"
                        )}
                      >
                        {uLogo ? (
                          <img
                            src={uLogo}
                            alt={u.nome}
                            className="w-full h-full object-cover pointer-events-none rounded-full select-none"
                            draggable={false}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-foreground font-bold text-2xl select-none">
                            {(u.nome || "B").charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      {/* Símbolo da câmera PARA FORA do círculo da imagem (estilo profile badge destacado) */}
                      {isSelected && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            logoInputRef.current?.click();
                          }}
                          disabled={uploadingLogo}
                          className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-foreground text-background shadow-xl border-2 border-background flex items-center justify-center hover:opacity-90 active:scale-95 transition-all z-20 cursor-pointer"
                          aria-label="Trocar logo da barbearia"
                        >
                          {uploadingLogo ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Camera className="w-4 h-4 stroke-[2]" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              } else {
                return (
                  <div
                    key="add-new-unit"
                    onClick={() => handleSelectCircle(index)}
                    className="relative w-[110px] h-[110px] shrink-0 snap-center flex items-center justify-center cursor-pointer select-none"
                  >
                    <div
                      className={cn(
                        "rounded-full border-2 border-dashed transition-all duration-200 flex items-center justify-center shrink-0 bg-card select-none",
                        isSelected
                          ? "w-[96px] h-[96px] border-foreground/80 shadow-md ring-2 ring-foreground/15 scale-100"
                          : "w-[72px] h-[72px] border-foreground/35 shadow-xs opacity-50 scale-95 hover:opacity-80"
                      )}
                    >
                      <Plus
                        className={cn(
                          "stroke-[2] text-foreground transition-transform",
                          isSelected ? "w-7 h-7" : "w-5 h-5"
                        )}
                      />
                    </div>
                  </div>
                );
              }
            })}
          </div>
        </div>

        {/* ═══ NOME E ENDEREÇO DA BARBEARIA CENTRALIZADOS (100% SÉRIO & MINIMALISTA, SUBIDO) ═══ */}
        <div className="flex flex-col items-center text-center px-5 mt-2 mb-3.5 select-none">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCarouselIndex < unidades.length ? unidades[activeCarouselIndex]?.id || "active" : "nova"}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center"
            >
              <h2 className="text-[23px] font-bold text-foreground leading-tight tracking-tight">
                {activeCarouselIndex < unidades.length 
                  ? (unidades[activeCarouselIndex]?.nome || tenantNome || DEFAULT_COMPANY_NAME) 
                  : "Nova Barbearia"}
              </h2>
              <div className="text-[13px] text-muted-foreground mt-1">
                {activeCarouselIndex < unidades.length ? (
                  unidades[activeCarouselIndex]?.bairro
                    ? `${unidades[activeCarouselIndex].bairro}${unidades[activeCarouselIndex].cidade ? `, ${unidades[activeCarouselIndex].cidade}` : ""}`
                    : "São Paulo, SP"
                ) : (
                  "Toque no botão + para cadastrar"
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ═══ CONTEÚDO: SE FOR UNIDADE ATIVA, EXIBE OS CARDS. SE FOR NOVA BARBEARIA, EXIBE O BOTÃO PRETO MINIMALISTA ═══ */}
        {activeCarouselIndex < unidades.length ? (
          <>
            {/* ═══ ACESSOS ESTRATÉGICOS PRINCIPAIS (4 CARDS: SERVIÇOS, PLANOS, HORÁRIOS, BARBEIROS) ═══ */}
            <div className="grid grid-cols-2 gap-3 mx-5 mt-2">
              {/* Card 1: Serviços */}
              <button
                type="button"
                onClick={() => setActiveScreen("servicos")}
                className="flex flex-col justify-between p-4 rounded-2xl bg-card border border-border/70 dark:border-white/[0.08] hover:border-foreground/30 active:scale-[0.98] transition-all shadow-xs group text-left min-h-[96px]"
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-foreground group-hover:bg-foreground group-hover:text-background transition-colors">
                    <Scissors className="w-4 h-4 stroke-[2]" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-foreground transition-colors" />
                </div>
                <div className="mt-3">
                  <span className="text-[14px] font-bold text-foreground block leading-tight">
                    Serviços
                  </span>
                  <span className="text-[11.5px] text-muted-foreground block truncate mt-0.5 font-normal">
                    Cortes & catálogo
                  </span>
                </div>
              </button>

              {/* Card 2: Planos da Barbearia */}
              <button
                type="button"
                onClick={() => setActiveScreen("planos")}
                className="flex flex-col justify-between p-4 rounded-2xl bg-card border border-border/70 dark:border-white/[0.08] hover:border-foreground/30 active:scale-[0.98] transition-all shadow-xs group text-left min-h-[96px]"
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-foreground group-hover:bg-foreground group-hover:text-background transition-colors">
                    <Package className="w-4 h-4 stroke-[2]" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-foreground transition-colors" />
                </div>
                <div className="mt-3">
                  <span className="text-[14px] font-bold text-foreground block leading-tight">
                    Planos da Barbearia
                  </span>
                  <span className="text-[11.5px] text-muted-foreground block truncate mt-0.5 font-normal">
                    Fidelidade & assinaturas
                  </span>
                </div>
              </button>

              {/* Card 3: Horários */}
              <button
                type="button"
                onClick={() => setActiveScreen("horarios")}
                className="flex flex-col justify-between p-4 rounded-2xl bg-card border border-border/70 dark:border-white/[0.08] hover:border-foreground/30 active:scale-[0.98] transition-all shadow-xs group text-left min-h-[96px]"
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-foreground group-hover:bg-foreground group-hover:text-background transition-colors">
                    <Clock className="w-4 h-4 stroke-[2]" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-foreground transition-colors" />
                </div>
                <div className="mt-3">
                  <span className="text-[14px] font-bold text-foreground block leading-tight">
                    Horários
                  </span>
                  <span className="text-[11.5px] text-muted-foreground block truncate mt-0.5 font-normal">
                    Expediente oficial
                  </span>
                </div>
              </button>

              {/* Card 4: Barbeiros */}
              <button
                type="button"
                onClick={() => setActiveScreen("barbeiros")}
                className="flex flex-col justify-between p-4 rounded-2xl bg-card border border-border/70 dark:border-white/[0.08] hover:border-foreground/30 active:scale-[0.98] transition-all shadow-xs group text-left min-h-[96px]"
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-foreground group-hover:bg-foreground group-hover:text-background transition-colors">
                    <UserCheck className="w-4 h-4 stroke-[2]" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-foreground transition-colors" />
                </div>
                <div className="mt-3">
                  <span className="text-[14px] font-bold text-foreground block leading-tight">
                    Barbeiros
                  </span>
                  <span className="text-[11.5px] text-muted-foreground block truncate mt-0.5 font-normal">
                    Equipe & cadastro
                  </span>
                </div>
              </button>
            </div>

            {/* ═══ ITENS — LAYOUT AGRUPADO, 100% SÉRIO E MINIMALISTA (SEM FUNDOS EM ÍCONES) ═══ */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.1 }}
              className="mx-5 space-y-4 mt-6"
            >
              {hubSections.map((sec) => (
                <div key={sec.label}>
                  <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-1 mb-2">
                    {sec.label}
                  </p>
                  <div className="rounded-2xl bg-card border border-border/60 dark:border-white/[0.08] overflow-hidden divide-y divide-border/25 shadow-xs">
                    {sec.items.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setActiveScreen(item.key)}
                        className="w-full flex items-center justify-between gap-3.5 px-4 py-3.5 text-left hover:bg-muted/20 active:bg-muted/40 transition-colors group"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <item.icon className="w-5 h-5 text-muted-foreground/80 group-hover:text-foreground transition-colors shrink-0 stroke-[1.6]" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[14.5px] font-semibold text-foreground truncate block leading-tight">
                                {item.title}
                              </span>
                              {item.badge && (
                                <span className="text-[9.5px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/40 shrink-0">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            <span className="text-[11.5px] text-muted-foreground block truncate mt-0.5 font-normal">
                              {item.description}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          </>
        ) : (
          /* ESTADO EXCLUSIVO DE NOVA BARBEARIA: BOTÃO PRETO SÉRIO E MINIMALISTA */
          <div className="flex flex-col items-center justify-center text-center px-6 py-12 max-w-sm mx-auto">
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="h-12 px-7 rounded-2xl bg-foreground text-background text-[14px] font-semibold flex items-center gap-2.5 shadow-md active:scale-95 transition-all hover:opacity-90"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Cadastrar Nova Barbearia</span>
            </button>
            <p className="text-[12px] text-muted-foreground mt-3 max-w-xs leading-relaxed">
              Adicione uma nova unidade para gerenciar equipe, serviços e horários de forma independente.
            </p>
          </div>
        )}

        {/* Modal Wizard de Criação de Unidade (acionado pelo botão + do carrossel) */}
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
      </div>
    );
  }

  /* ═══ MODO SUB-TELA (SUB-ROTA) ═══ */
  return (
    <div className="min-h-[var(--app-height,100dvh)] bg-background pb-20">
      {/* Botão voltar para o Hub se for sub-tela interna */}
      {activeScreen !== "todas-unidades" && (
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/40 px-4 py-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveScreen("hub")}
            className="w-8 h-8 rounded-full bg-secondary text-foreground flex items-center justify-center hover:bg-secondary/80 active:scale-95 transition-all"
            aria-label="Voltar para configurações da barbearia"
          >
            <BackArrow />
          </button>
          <span className="text-[14px] font-semibold text-foreground">
            {flatItems.find((i) => i.key === activeScreen)?.title || "Configurações"}
          </span>
        </div>
      )}

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
    </div>
  );
}
