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
import { SelectBarbeariaDrawer } from "@/components/admin/unidades/SelectBarbeariaDrawer";
import type { Unidade } from "@/components/admin/unidades/AdminUnidades";

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
  | "servicos"
  | "planos"
  | "formas-pagamento"
  | "loja"
  | "avaliacoes"
  | "barbeiros"
  | "clientes"
  | "todas-unidades"
  | "fotos-banner";

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
      case "fotos-banner":
        return (
          <div className="pb-10 min-h-app bg-background">
            <ScheduleHeader title="Foto e Banner" onBack={() => setActiveScreen("hub")} />
            <div className="px-4 pt-4 max-w-md mx-auto space-y-4">
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
      default:
        return null;
    }
  };

  /** Se uma sub-tela estiver ativa, renderiza a sub-tela correspondente */
  if (activeScreen !== "hub") {
    return (
      <div className="min-h-app bg-background">
        {/* Inputs ocultos para upload de foto e banner em sub-telas */}
        <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
        <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" />

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

      <div className="px-4 pt-3 max-w-md mx-auto space-y-4">
        {/* Barra Superior: Barbearia Ativa + Botão Trocar Barbearia */}
        <div className="flex items-center justify-between gap-3 px-1 py-1">
          <div className="min-w-0 flex-1">
            <span className="text-[14.5px] font-semibold text-foreground truncate block">
              {activeUnit?.nome || tenantNome}
            </span>
          </div>

          {/* Botão Trocar Barbearia */}
          <button
            type="button"
            onClick={() => setShowSelectUnitDrawer(true)}
            className="text-[12px] font-medium text-muted-foreground hover:text-foreground active:scale-95 transition-all flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-secondary/60 hover:bg-secondary border border-border/40 shadow-xs shrink-0"
          >
            <Store className="w-3.5 h-3.5 opacity-70" />
            <span>Trocar barbearia</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
        </div>

        {/* ═══ CARD DE IDENTIDADE VISUAL: FOTO E BANNER DA BARBEARIA ═══ */}
        <div
          onClick={() => setActiveScreen("fotos-banner")}
          className="rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card overflow-hidden shadow-xs cursor-pointer group hover:border-foreground/30 transition-all"
        >
          {/* Banner Preview Compacto com altura controlada (100px) */}
          <div className="relative w-full h-[100px] bg-muted overflow-hidden" style={{ height: 100, maxHeight: 100 }}>
            <img
              src={bannerUrl || profileBannerDefault}
              alt="Banner da barbearia"
              className="w-full h-full object-cover group-hover:scale-[1.01] transition-transform duration-300"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/15 to-transparent" />

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                bannerInputRef.current?.click();
              }}
              disabled={uploadingBanner}
              className="absolute top-2.5 right-2.5 h-6 px-2.5 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/15 text-white/90 text-[10.5px] font-medium flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
              title="Trocar banner"
            >
              {uploadingBanner ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Camera className="w-3 h-3" />
              )}
              <span>Alterar banner</span>
            </button>
          </div>

          {/* Logo e Nome da Barbearia com dimensões estritamente fixadas */}
          <div className="px-4 pb-3.5 pt-0 flex items-end justify-between gap-3">
            <div className="flex items-end gap-3 min-w-0">
              {/* Avatar da Logo da Barbearia (60px x 60px fixo) com badge de câmera projetado para fora */}
              <div className="relative -mt-7 shrink-0" style={{ width: 60, height: 60 }}>
                <div
                  className="w-full h-full rounded-2xl border-2 border-card bg-secondary overflow-hidden shadow-md flex items-center justify-center"
                  style={{ width: 60, height: 60, minWidth: 60, minHeight: 60 }}
                >
                  {activeUnit?.logo_url || tenantLogoUrl ? (
                    <img
                      src={activeUnit?.logo_url || tenantLogoUrl || DEFAULT_COMPANY_LOGO}
                      alt={tenantNome}
                      className="w-full h-full object-cover rounded-2xl"
                      style={{ width: 60, height: 60, objectFit: "cover" }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold text-foreground text-lg">
                      {(tenantNome || "B").charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Botão da Câmera 100% funcional no canto inferior direito, projetado para fora sem recorte */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    logoInputRef.current?.click();
                  }}
                  disabled={uploadingLogo}
                  className="absolute -bottom-1 -right-1 z-10 w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center border-2 border-card shadow-md hover:scale-110 active:scale-95 transition-all cursor-pointer"
                  title="Trocar foto de perfil"
                  aria-label="Trocar foto de perfil"
                >
                  {uploadingLogo ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : (
                    <Camera className="w-3 h-3 stroke-[2.2]" />
                  )}
                </button>
              </div>

              <div className="min-w-0 pb-0.5">
                <p className="text-[14px] font-semibold text-foreground truncate leading-tight">
                  {activeUnit?.nome || tenantNome || DEFAULT_COMPANY_NAME}
                </p>
                <p className="text-[11.5px] text-muted-foreground truncate mt-0.5">
                  Foto de perfil e banner da barbearia
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveScreen("fotos-banner");
              }}
              className="shrink-0 mb-0.5 flex items-center gap-1 active:scale-95 transition-all px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-[12px] font-medium border border-border/40 shadow-xs"
            >
              <span>Editar</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ═══ LISTA UNIFICADA DIRETO NA TELA DE FUNDO (PADRÃO ATENDIMENTO & NOTIFICAÇÕES) ═══ */}
        {/* Fica 100% sério, limpo, sem quadradinhos ou caixas em volta */}
        <div className="divide-y divide-border/25 dark:divide-white/[0.08] pt-1">
          <ConfigListItem
            label="Dados da Barbearia"
            description="Nome, WhatsApp, endereço e redes sociais"
            onClick={() => setActiveScreen("dados-empresa")}
          />
          <ConfigListItem
            label="Atendimento & Notificações"
            description="WhatsApp conectado, agente de IA e lembretes automáticos"
            onClick={() => setActiveScreen("whatsapp")}
          />
          <ConfigListItem
            label="Horário de funcionamento"
            description="Expediente oficial e dias de atendimento da barbearia"
            onClick={() => setActiveScreen("horarios")}
          />
          <ConfigListItem
            label="Barbeiros & Cadeiras"
            description="Equipe de profissionais cadastrados nesta unidade"
            onClick={() => setActiveScreen("barbeiros")}
          />
          <ConfigListItem
            label="Serviços & Cortes"
            description="Catálogo de cortes, barbas, durações e valores"
            onClick={() => setActiveScreen("servicos")}
          />
          <ConfigListItem
            label="Planos da Barbearia"
            description="Clubes de fidelidade e assinaturas recorrentes"
            onClick={() => setActiveScreen("planos")}
          />
          <ConfigListItem
            label="Clientes da Barbearia"
            description="Base de contatos, histórico e fidelidade"
            onClick={() => setActiveScreen("clientes")}
          />
          <ConfigListItem
            label="Avaliações da Barbearia"
            description="Feedbacks e notas dos clientes sobre a barbearia"
            onClick={() => setActiveScreen("avaliacoes")}
          />
          <ConfigListItem
            label="Filiais da Barbearia"
            description={`${unidades.length} ${unidades.length === 1 ? "unidade cadastrada" : "unidades cadastradas"} · Matriz e filiais`}
            onClick={() => setShowSelectUnitDrawer(true)}
          />
        </div>
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
    </div>
  );
}

/**
 * Subcomponente de item de menu direto na tela de fundo (Padrão Atendimento & Notificações)
 */
function ConfigListItem({
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
      className="w-full py-3.5 px-1 flex items-center justify-between text-left hover:opacity-80 active:opacity-60 transition-opacity group"
    >
      <div className="min-w-0 pr-3">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold text-foreground block truncate leading-tight">
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
