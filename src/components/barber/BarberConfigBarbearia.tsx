import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  ChevronDown,
  Camera,
  Loader2,
  Plus,
  Store,
  Image as ImageIcon,
} from "lucide-react";
import { BarberContext } from "@/pages/Barbeiro";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";
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
 * Padrão 100% sério, minimalista, institucional e estratégico (Alinhado a Atendimento & Notificações):
 *   - ScheduleHeader institucional no topo
 *   - Card compacto de identidade visual (Banner + Foto da Barbearia), onde clicar abre a personalização de foto e banner
 *   - Lista unificada única de configurações em um único bloco clean que cabe confortavelmente na tela
 *   - Gaveta (drawer) de baixo para cima para troca rápida de filiais e cadastro
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

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Unidades da Barbearia
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [selectedUnidadeId, setSelectedUnidadeId] = useState<string>("todas");
  const [loadingUnidades, setLoadingUnidades] = useState(true);

  // Modais
  const [showSelectUnitDrawer, setShowSelectUnitDrawer] = useState(false);
  const [showImageEditModal, setShowImageEditModal] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailUnidade, setDetailUnidade] = useState<Unidade | null>(null);

  useStatusBarColor("app-background");

  /** Busca dados gerais do tenant e da Barbearia DUB */
  useEffect(() => {
    let mounted = true;
    (async () => {
      let resolvedName = "";
      let resolvedLogo: string | null = null;
      let resolvedBanner: string | null = null;
      let tId = barberContext.tenantId || resolvedTenantId;

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

  /** Unidade atualmente ativa em exibição */
  const activeUnit = useMemo(() => {
    return unidades.find((u) => u.id === selectedUnidadeId) || unidades[0];
  }, [unidades, selectedUnidadeId]);

  /** Seleciona uma unidade pelo Drawer */
  const handleSelectUnit = (unit: Unidade) => {
    setSelectedUnidadeId(unit.id);
    if (unit.nome) setTenantNome(unit.nome);
    if (unit.logo_url) setTenantLogoUrl(unit.logo_url);
    if (unit.tenant_id) setResolvedTenantId(unit.tenant_id);
    setShowSelectUnitDrawer(false);
    toast.success(`Gerenciando ${unit.nome}`);
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

  /** Renderiza sub-telas selecionadas */
  const renderSubScreen = () => {
    const tenantId = resolvedTenantId || barberContext.tenantId || undefined;
    switch (activeScreen) {
      case "dados-empresa":
        return (
          <div className="pb-10">
            <ScheduleHeader title="Dados da Barbearia" onBack={() => setActiveScreen("hub")} />
            <div className="px-4 pt-2">
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
            />
          </div>
        );
      case "horarios":
        return (
          <div className="pb-10">
            <ScheduleHeader title="Horário de Funcionamento" onBack={() => setActiveScreen("hub")} />
            <div className="px-4 pt-3 max-w-md mx-auto">
              <AdminHorarios hideTitle companyMode tenantId={tenantId} />
            </div>
          </div>
        );
      case "servicos":
        return (
          <div className="pb-10">
            <ScheduleHeader title="Serviços & Cortes" onBack={() => setActiveScreen("hub")} />
            <div className="px-4 pt-3 max-w-md mx-auto">
              <AdminCortes tenantId={tenantId} basePath={appBasePath} hideHeader />
            </div>
          </div>
        );
      case "planos":
        return (
          <div className="pb-10">
            <ScheduleHeader title="Planos da Barbearia" onBack={() => setActiveScreen("hub")} />
            <div className="px-4 pt-3 max-w-md mx-auto">
              <AdminPlanos tenantId={tenantId} basePath={appBasePath} hideHeader />
            </div>
          </div>
        );
      case "avaliacoes":
        return (
          <div className="pb-10">
            <ScheduleHeader title="Avaliações da Barbearia" onBack={() => setActiveScreen("hub")} />
            <div className="px-4 pt-3 max-w-md mx-auto">
              <AdminAvaliacoes tenantId={tenantId} basePath={appBasePath} hideHeader onBack={() => setActiveScreen("hub")} />
            </div>
          </div>
        );
      case "barbeiros":
        return (
          <div className="pb-10">
            <ScheduleHeader title="Barbeiros & Equipe" onBack={() => setActiveScreen("hub")} />
            <div className="px-4 pt-3 max-w-md mx-auto">
              <AdminBarbeiros basePath={appBasePath} hideHeader onBack={() => setActiveScreen("hub")} />
            </div>
          </div>
        );
      case "clientes":
        return (
          <div className="pb-10">
            <ScheduleHeader title="Clientes da Barbearia" onBack={() => setActiveScreen("hub")} />
            <div className="px-4 pt-3 max-w-md mx-auto">
              <BarberClientes
                barberContext={barberContext}
                forceViewMode="todos"
                initialUnitId={selectedUnidadeId === "todas" ? undefined : selectedUnidadeId}
                hideHeader
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  /** Se uma sub-tela estiver ativa, renderiza a sub-tela correspondente */
  if (activeScreen !== "hub") {
    return (
      <div className="min-h-app bg-background">
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

  /** Hub principal — 100% sério, minimalista, institucional e estratégico (Padrão Atendimento & Notificações) */
  return (
    <div className="pb-10 min-h-app bg-background">
      {/* Inputs ocultos para upload de foto e banner */}
      <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
      <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" />

      {/* Header Institucional Padrão do Sistema */}
      <ScheduleHeader
        title="Configurações da Barbearia"
        onBack={() => navigate(`${appBasePath}/perfil`)}
      />

      <div className="px-4 pt-3 max-w-md mx-auto space-y-3.5">
        {/* Seletor Minimalista de Filial Ativa (quando houver mais de uma unidade) */}
        {unidades.length > 1 && (
          <div className="flex items-center justify-between px-1 py-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[14px] font-semibold text-foreground truncate">
                {activeUnit?.nome || tenantNome}
              </span>
              {activeUnit?.is_sede && (
                <span className="text-[9.5px] font-medium uppercase px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border/40 shrink-0">
                  Sede
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowSelectUnitDrawer(true)}
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground active:scale-95 transition-all shrink-0 flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-secondary/60 hover:bg-secondary border border-border/40"
            >
              <Store className="w-3.5 h-3.5 opacity-70" />
              <span>Trocar barbearia</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
          </div>
        )}

        {/* ═══ CARD DE IDENTIDADE VISUAL: FOTO E BANNER DA BARBEARIA ═══ */}
        <div
          onClick={() => setShowImageEditModal(true)}
          className="rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card overflow-hidden shadow-xs cursor-pointer group hover:border-foreground/30 transition-all"
        >
          {/* Banner Preview Compacto e Elegante */}
          <div className="relative w-full h-24 bg-muted overflow-hidden">
            <img
              src={bannerUrl || profileBannerDefault}
              alt="Banner da barbearia"
              className="w-full h-full object-cover group-hover:scale-[1.01] transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                bannerInputRef.current?.click();
              }}
              disabled={uploadingBanner}
              className="absolute top-2.5 right-2.5 h-6 px-2.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white text-[11px] font-medium flex items-center gap-1.5 hover:bg-black/80 active:scale-95 transition-all shadow-xs"
              title="Trocar banner"
            >
              {uploadingBanner ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Camera className="w-3 h-3" />
              )}
              <span>Trocar banner</span>
            </button>
          </div>

          {/* Logo e Nome da Barbearia */}
          <div className="p-3.5 pt-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative -mt-6 shrink-0">
                <Avatar className="w-13 h-13 rounded-2xl border-2 border-card bg-secondary overflow-hidden shadow-md">
                  <AvatarImage src={activeUnit?.logo_url || tenantLogoUrl || DEFAULT_COMPANY_LOGO} className="object-cover" />
                  <AvatarFallback className="rounded-2xl font-bold text-base bg-secondary text-foreground">
                    {(activeUnit?.nome || tenantNome || "B").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    logoInputRef.current?.click();
                  }}
                  disabled={uploadingLogo}
                  className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center border border-card shadow-xs hover:opacity-90 active:scale-95 transition-all"
                  title="Trocar foto/logo"
                >
                  {uploadingLogo ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Camera className="w-2.5 h-2.5 stroke-[2]" />}
                </button>
              </div>

              <div className="min-w-0 pt-0.5">
                <div className="flex items-center gap-1.5">
                  <p className="text-[13.5px] font-semibold text-foreground truncate">
                    {activeUnit?.nome || tenantNome || DEFAULT_COMPANY_NAME}
                  </p>
                  {activeUnit?.is_sede && (
                    <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border/40 shrink-0">
                      Sede
                    </span>
                  )}
                </div>
                <p className="text-[11.5px] text-muted-foreground truncate mt-0.5">
                  Foto de perfil e banner da barbearia
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowImageEditModal(true);
              }}
              className="shrink-0 flex items-center gap-1 active:scale-95 transition-all px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-[12px] font-medium border border-border/40"
            >
              <span>Editar</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ═══ LISTA UNIFICADA ÚNICA (PADRÃO ATENDIMENTO & NOTIFICAÇÕES) ═══ */}
        {/* Fica confortavelmente na tela, sem blocos separados ou poluição visual */}
        <div className="rounded-2xl bg-card border border-border/60 dark:border-white/[0.08] divide-y divide-border/25 dark:divide-white/[0.06] overflow-hidden shadow-xs">
          <ConfigMenuItem
            label="Dados da Barbearia"
            description="Nome, WhatsApp, endereço e redes sociais"
            onClick={() => setActiveScreen("dados-empresa")}
          />
          <ConfigMenuItem
            label="Atendimento & Notificações"
            description="WhatsApp conectado, agente de IA e lembretes automáticos"
            onClick={() => setActiveScreen("whatsapp")}
          />
          <ConfigMenuItem
            label="Horário de funcionamento"
            description="Expediente oficial e dias de atendimento da barbearia"
            onClick={() => setActiveScreen("horarios")}
          />
          <ConfigMenuItem
            label="Barbeiros & Cadeiras"
            description="Equipe de profissionais cadastrados nesta unidade"
            onClick={() => setActiveScreen("barbeiros")}
          />
          <ConfigMenuItem
            label="Serviços & Cortes"
            description="Catálogo de cortes, barbas, durações e valores"
            onClick={() => setActiveScreen("servicos")}
          />
          <ConfigMenuItem
            label="Planos da Barbearia"
            description="Clubes de fidelidade e assinaturas recorrentes"
            onClick={() => setActiveScreen("planos")}
          />
          <ConfigMenuItem
            label="Clientes da Barbearia"
            description="Base de contatos, histórico e fidelidade"
            onClick={() => setActiveScreen("clientes")}
          />
          <ConfigMenuItem
            label="Avaliações da Barbearia"
            description="Feedbacks e notas dos clientes sobre a barbearia"
            onClick={() => setActiveScreen("avaliacoes")}
          />
          <ConfigMenuItem
            label="Filiais da Barbearia"
            description={`${unidades.length} ${unidades.length === 1 ? "unidade cadastrada" : "unidades cadastradas"} · Matriz e filiais`}
            onClick={() => setShowSelectUnitDrawer(true)}
          />
        </div>
      </div>

      {/* ═══ DRAWER DE FOTO E BANNER DA BARBEARIA (100% MINIMALISTA) ═══ */}
      <AnimatePresence>
        {showImageEditModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => setShowImageEditModal(false)} />
            <motion.div
              initial={{ y: "100%", opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="relative w-full sm:max-w-md rounded-t-[28px] sm:rounded-2xl border border-border/70 dark:border-white/[0.1] bg-card p-5 pb-8 sm:pb-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto -mt-1 mb-2 sm:hidden shrink-0" />

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[16px] font-bold text-foreground tracking-tight">
                    Foto e Banner da Barbearia
                  </h3>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    Personalize a imagem de perfil e a capa da sua barbearia
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowImageEditModal(false)}
                  className="w-8 h-8 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0 text-xs font-semibold"
                >
                  ✕
                </button>
              </div>

              {/* Pré-visualização combinada */}
              <div className="rounded-2xl border border-border/60 bg-muted/30 overflow-hidden">
                {/* Banner */}
                <div className="relative w-full h-32 bg-muted overflow-hidden">
                  <img
                    src={bannerUrl || profileBannerDefault}
                    alt="Banner da barbearia"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                  <button
                    type="button"
                    onClick={() => bannerInputRef.current?.click()}
                    disabled={uploadingBanner}
                    className="absolute top-3 right-3 h-8 px-3 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white text-[11.5px] font-medium flex items-center gap-1.5 hover:bg-black/80 active:scale-95 transition-all shadow-sm"
                  >
                    {uploadingBanner ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                    <span>Trocar banner</span>
                  </button>
                </div>

                {/* Logo sobreposto */}
                <div className="p-4 pt-0 flex items-end justify-between gap-3">
                  <div className="relative -mt-9 shrink-0">
                    <div className="w-18 h-18 rounded-2xl border-3 border-card bg-secondary overflow-hidden shadow-lg">
                      <img
                        src={activeUnit?.logo_url || tenantLogoUrl || DEFAULT_COMPANY_LOGO}
                        alt={tenantNome}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploadingLogo}
                      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center border-2 border-card shadow-sm hover:opacity-90 active:scale-95 transition-all"
                      title="Trocar logo"
                    >
                      {uploadingLogo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3 stroke-[2]" />}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 pb-1">
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploadingLogo}
                      className="px-3.5 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-[12px] font-medium border border-border/40 transition-colors"
                    >
                      {uploadingLogo ? "Enviando..." : "Trocar foto"}
                    </button>
                    {bannerUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveBanner}
                        className="px-3 py-1.5 rounded-xl text-muted-foreground hover:text-destructive text-[12px] font-medium transition-colors"
                      >
                        Remover banner
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Informações de recomendação */}
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/40 space-y-1.5">
                <p className="text-[12px] text-foreground font-semibold flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 opacity-70" />
                  <span>Formatos recomendados</span>
                </p>
                <ul className="text-[11.5px] text-muted-foreground space-y-1 leading-relaxed">
                  <li>• <strong className="text-foreground/90 font-medium">Foto da barbearia:</strong> formato quadrado (1:1), 500x500px ou superior.</li>
                  <li>• <strong className="text-foreground/90 font-medium">Banner de capa:</strong> formato horizontal (16:9 ou 3:1), 1920x640px ou superior.</li>
                </ul>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowImageEditModal(false)}
                  className="w-full h-11 rounded-xl bg-foreground text-background text-[13px] font-semibold active:scale-[0.98] transition-transform shadow-xs"
                >
                  Concluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══ DRAWER DE SELEÇÃO DE BARBEARIA / FILIAL (GAVETA DE BAIXO PARA CIMA) ═══ */}
      <AnimatePresence>
        {showSelectUnitDrawer && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => setShowSelectUnitDrawer(false)} />
            <motion.div
              initial={{ y: "100%", opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="relative w-full sm:max-w-md rounded-t-[28px] sm:rounded-2xl border border-border/70 dark:border-white/[0.1] bg-card p-5 pb-8 sm:pb-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto"
            >
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto -mt-1 mb-2 sm:hidden shrink-0" />

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[16px] font-bold text-foreground tracking-tight">
                    Filiais da Barbearia
                  </h3>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    Selecione a unidade para gerenciar
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSelectUnitDrawer(false)}
                  className="w-8 h-8 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0 text-xs font-semibold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2 pt-1">
                {unidades.map((u) => {
                  const isCurrent = activeUnit?.id === u.id;
                  const uLogo = u.logo_url || tenantLogoUrl || DEFAULT_COMPANY_LOGO;

                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleSelectUnit(u)}
                      className={cn(
                        "w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 active:scale-[0.99] group",
                        isCurrent
                          ? "bg-secondary/40 border-foreground/30 shadow-xs ring-1 ring-foreground/20"
                          : "bg-card border-border/70 dark:border-white/[0.08] hover:border-foreground/30 hover:bg-secondary/20"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm transition-colors overflow-hidden",
                            isCurrent
                              ? "bg-foreground text-background"
                              : "bg-secondary text-foreground group-hover:bg-secondary/80"
                          )}
                        >
                          {uLogo ? (
                            <img src={uLogo} alt={u.nome} className="w-full h-full object-cover" />
                          ) : (
                            <Store className="w-5 h-5 stroke-[1.8]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-bold text-foreground truncate block leading-tight">
                              {u.nome}
                            </span>
                            {u.is_sede && (
                              <span className="text-[9.5px] font-semibold uppercase px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border/40 shrink-0">
                                Sede
                              </span>
                            )}
                          </div>
                          <p className="text-[11.5px] text-muted-foreground truncate mt-1">
                            {[u.bairro, u.cidade].filter(Boolean).join(", ") || u.telefone || "Endereço não informado"}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 pl-2">
                        {isCurrent ? (
                          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                            Gerenciando
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors flex items-center gap-0.5">
                            Selecionar
                            <ChevronRight className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowSelectUnitDrawer(false);
                    setWizardOpen(true);
                  }}
                  className="w-full h-11 rounded-xl bg-foreground text-background text-[13px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all hover:opacity-90 shadow-sm"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Cadastrar Nova Barbearia</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
    </div>
  );
}

/**
 * Subcomponente de item de menu 100% sério, alinhado à tipografia do Atendimento & Notificações
 */
function ConfigMenuItem({
  label,
  description,
  badge,
  onClick,
}: {
  label: string;
  description: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/20 active:bg-muted/40 transition-colors group"
    >
      <div className="min-w-0 pr-3">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold text-foreground block truncate leading-tight group-hover:text-foreground transition-colors">
            {label}
          </span>
          {badge && (
            <span className="text-[9.5px] font-medium uppercase px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border/40 shrink-0">
              {badge}
            </span>
          )}
        </div>
        <span className="text-[11.5px] text-muted-foreground block truncate mt-0.5 leading-snug font-normal">
          {description}
        </span>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/35 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
    </button>
  );
}
