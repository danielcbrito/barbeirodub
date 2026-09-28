import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarEditSheet } from "@/components/admin/mobile/AvatarEditSheet";
import {
  Loader2, ImagePlus,
  ChevronRight, Megaphone, LogOut,
  Send, Star,
} from "lucide-react";
import { CopyCode } from "@/components/ui/copy-code-button";

import { SetupCompletionBanner } from "@/components/barber/SetupCompletionBanner";
import { useSetupCompletion } from "@/hooks/useSetupCompletion";
import { useAdminBarbeiroId } from "@/hooks/useAdminBarbeiroId";
import { useAtualizarBannerAdmin } from "@/hooks/useAdminMutations";
import { resolveOwnerIdentity } from "@/lib/ownerIdentity";
import { useStatusBarColor } from "@/hooks/useStatusBarColor";
import { ApplyScopeSheet, type ApplyScope } from "@/components/admin/mobile/ApplyScopeSheet";
import { ThemeSegmentedToggle } from "@/components/profile/ThemeSegmentedToggle";
import { useTenantBarbersCount } from "@/hooks/useTenantBarbersCount";
import { readSyncCache, writeSyncCache } from "@/lib/syncQueryCache";
import { WhenToSendDrawer } from "@/components/admin/WhenToSendDrawer";
import { SelectBarbeariaDrawer } from "@/components/admin/unidades/SelectBarbeariaDrawer";


interface AdminMobileProfileProps {
  basePath?: string;
  isTenant?: boolean;
}

/**
 * Perfil mobile do Admin/Dono.
 * Estrutura estratégica inspirada em apps modernos (iFood/Uber):
 *  - Identidade: avatar do dono + logo da barbearia sobreposta (dono de tudo)
 *  - Card premium "Dub Pago" (carteira) — cartão flutuante branco sobre base cinza
 *  - Banner de destaque: Campanhas para atrair clientes
 *  - Banner de Filiais (substitui o antigo "Configurações da barbearia")
 *  - Lista limpa de configurações reais (horários, clientes, portfólio, etc)
 */
interface AdminProfileCache {
  userId: string | null;
  email: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  tenantLogo: string | null;
  tenantName: string;
  tenantSlug: string | null;
  tenantId: string | null;
  unitsCount: number;
  profileName: string;
}

const PROFILE_CACHE_KEY = "admin-mobile-profile";

export function AdminMobileProfile({ basePath = "/admin", isTenant = false }: AdminMobileProfileProps) {
  const navigate = useNavigate();
  // Hidratação SÍNCRONA (mesmo motor "Instant Start" do barbeiro):
  // abre com os dados do último acesso em ~0ms e revalida em silêncio.
  const cached = useRef(readSyncCache<AdminProfileCache>(PROFILE_CACHE_KEY)?.data ?? null).current;
  const [loading, setLoading] = useState(!cached);
  const [email, setEmail] = useState(cached?.email ?? "");
  const [userId, setUserId] = useState<string | null>(cached?.userId ?? null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(cached?.avatarUrl ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(cached?.bannerUrl ?? null);
  const [tenantLogo, setTenantLogo] = useState<string | null>(cached?.tenantLogo ?? null);
  const [tenantName, setTenantName] = useState<string>(cached?.tenantName ?? "");
  const [unitsCount, setUnitsCount] = useState<number>(cached?.unitsCount ?? 0);
  const [tenantId, setTenantId] = useState<string | null>(cached?.tenantId ?? null);

  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopeConfig, setScopeConfig] = useState<{
    title: string;
    description: string;
    onConfirm: (scope: ApplyScope) => void;
  } | null>(null);
  const [avatarEditOpen, setAvatarEditOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tenantSlug, setTenantSlug] = useState<string | null>(cached?.tenantSlug ?? null);
  const [profileName, setProfileName] = useState(cached?.profileName ?? "");

  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showWhenToSend, setShowWhenToSend] = useState(false);
  const [barbeariaDrawerOpen, setBarbeariaDrawerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const atualizarBanner = useAtualizarBannerAdmin();
  const { barbeiroId: adminBarbeiroId } = useAdminBarbeiroId(userId || "");
  const { hasMultiple: hasMultipleBarbers } = useTenantBarbersCount(tenantId);
  const setupCompletion = useSetupCompletion({
    userId: userId || "",
    barbeiroId: adminBarbeiroId || "",
    basePath,
    personalDataOptional: true,
    routeOverrides: {
      dados_gerais: `${basePath}/dados-empresa`,
      servicos: `${basePath}/servicos/cortes`,
    },
  });

  useEffect(() => { loadProfile(); }, []);

  const patchProfileCache = (patch: Partial<AdminProfileCache>) => {
    const current = readSyncCache<AdminProfileCache>(PROFILE_CACHE_KEY)?.data;
    if (!current) return;
    writeSyncCache<AdminProfileCache>(PROFILE_CACHE_KEY, { ...current, ...patch });
  };

  const loadProfile = async () => {

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Se o cache é de outro usuário, limpa a tela antes de revalidar
      if (cached && cached.userId && cached.userId !== user.id) {
        setAvatarUrl(null); setBannerUrl(null); setTenantLogo(null);
        setTenantName(""); setTenantSlug(null); setTenantId(null);
        setUnitsCount(0); setProfileName("");
      }

      setUserId(user.id);
      setEmail(user.email || "");

      // ── Fase 1: tudo que não depende de nada roda em PARALELO ──
      const [profileRes, identity, ownerTenantRes, barbRes] = await Promise.all([
        supabase.from("profiles").select("avatar_url, banner_url" as any).eq("id", user.id).maybeSingle(),
        resolveOwnerIdentity(user.id),
        supabase.from("tenants").select("id, slug, nome, logo_url")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("barbeiros").select("tenant_id")
          .eq("user_id", user.id).eq("ativo", true).is("deleted_at", null)
          .not("tenant_id", "is", null)
          .order("created_at", { ascending: true }).limit(1).maybeSingle(),
      ]);

      const profile: any = profileRes.data || {};
      const nextAvatar = profile.avatar_url || null;
      const nextBanner = profile.banner_url || null;
      setAvatarUrl(nextAvatar);
      setBannerUrl(nextBanner);
      setProfileName(identity.displayName);

      let resolvedTenantId: string | null = null;
      let nextSlug: string | null = null;
      let nextName = "";
      let nextLogo: string | null = null;

      const tenant = ownerTenantRes.data as any;
      if (tenant?.id) {
        resolvedTenantId = tenant.id;
        nextSlug = tenant.slug || null;
        nextName = tenant.nome || "";
        nextLogo = tenant.logo_url || null;
      } else if ((barbRes.data as any)?.tenant_id) {
        resolvedTenantId = (barbRes.data as any).tenant_id;
        const { data: t } = await supabase
          .from("tenants").select("slug, nome, logo_url")
          .eq("id", resolvedTenantId).maybeSingle();
        nextSlug = (t as any)?.slug || null;
        nextName = (t as any)?.nome || "";
        nextLogo = (t as any)?.logo_url || null;
      }

      setTenantSlug(nextSlug);
      setTenantName(nextName);
      setTenantLogo(nextLogo);
      setTenantId(resolvedTenantId);

      let nextUnits = 0;
      if (resolvedTenantId) {
        const { count } = await supabase
          .from("unidades" as any)
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", resolvedTenantId);
        nextUnits = count || 0;
        setUnitsCount(nextUnits);
      } else {
        setUnitsCount(0);
      }

      writeSyncCache<AdminProfileCache>(PROFILE_CACHE_KEY, {
        userId: user.id,
        email: user.email || "",
        avatarUrl: nextAvatar,
        bannerUrl: nextBanner,
        tenantLogo: nextLogo,
        tenantName: nextName,
        tenantSlug: nextSlug,
        tenantId: resolvedTenantId,
        unitsCount: nextUnits,
        profileName: identity.displayName,
      });
    } catch (error) {
      console.error("Erro ao carregar perfil:", error);
    } finally {
      setLoading(false);
    }
  };


  const fullLink = tenantSlug ? `https://dubagenda.lovable.app/${tenantSlug}` : "";
  const displayLink = tenantSlug ? `dubagenda.lovable.app/${tenantSlug}` : "";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione apenas imagens"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Máximo 5MB"); return; }
    setSelectedFile(file);
    setAvatarEditOpen(true);
    e.target.value = "";
  };

  const handleBannerChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione apenas imagens"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Máximo 5MB"); return; }

    setUploadingBanner(true);
    try {
      const fileName = `banner-${userId}-${Date.now()}.webp`;
      const filePath = `banners/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;
      atualizarBanner.mutate(
        { userId, bannerUrl: publicUrl },
        { onSuccess: () => { setBannerUrl(publicUrl); patchProfileCache({ bannerUrl: publicUrl }); } }
      );
    } catch (error: any) {
      console.error("Erro ao fazer upload do banner:", error);
      toast.error("Erro ao fazer upload do banner");
    } finally {
      setUploadingBanner(false);
      e.target.value = "";
    }
  };

  const handleHorariosClick = () => {
    const goWithScope = (scope: ApplyScope) => {
      const qs =
        scope.type === "self"
          ? "?scope=self"
          : `?scope=units&unit_ids=${scope.unitIds.join(",")}`;
      navigate(`${basePath}/horarios${qs}`);
    };

    if (!hasMultipleBarbers) {
      goWithScope({ type: "self" });
      return;
    }

    setScopeConfig({
      title: "Aplicar horário a...",
      description: "Escolha se esse horário vale só pra você ou pras barbearias.",
      onConfirm: goWithScope,
    });
    setScopeOpen(true);
  };

  const initials = email ? email.charAt(0).toUpperCase() : "A";

  useStatusBarColor("app-background");

  if (loading) {
    return (
      <div className="min-h-[var(--app-height,100dvh)] bg-background">
        {/* Placeholder do banner — pinta a safe-area no topo enquanto carrega,
            evitando a "faixa cinza/branca" sob a status bar no iOS PWA. */}
        <div
          className="relative w-full overflow-hidden bg-muted"
          style={{ height: "calc(6.5rem + var(--app-safe-top, env(safe-area-inset-top, 0px)))" }}
        >
          <div className="w-full h-full bg-gradient-to-br from-muted via-muted/70 to-background" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/5 to-background" />
        </div>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="min-h-[var(--app-height,100dvh)] bg-background"
        style={{ paddingBottom: "calc(6.5rem + var(--app-safe-bottom, 8px))" }}
      >
        {/* ═══ BANNER FINO NO TOPO (edge-to-edge, sob a status bar) ═══ */}
        <div className="relative isolate bg-background">
          <div
            className="relative w-full overflow-hidden bg-muted"
            style={{ height: "calc(6.5rem + var(--app-safe-top, env(safe-area-inset-top, 0px)))" }}
          >
            {bannerUrl ? (
              <img
                src={bannerUrl}
                alt="Banner da barbearia"
                className="w-full h-full object-cover"
                style={{ objectPosition: "center" }}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-muted via-muted/70 to-background" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/5 to-background" />
          </div>

          {/* Botão trocar banner — canto superior direito, discreto */}
          <button
            onClick={() => bannerInputRef.current?.click()}
            disabled={uploadingBanner}
            className="absolute right-3 z-10 h-8 px-2.5 rounded-lg bg-black/40 backdrop-blur-sm flex items-center gap-1.5 text-white/90 hover:bg-black/60 active:scale-95 transition-all"
            style={{ top: "calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 12px)" }}
            aria-label="Alterar banner"
          >
            {uploadingBanner ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
            <span className="text-[11px] font-medium">Editar</span>
          </button>
        </div>

        {/* ═══ HEADER ABAIXO DO BANNER — avatar sobrepondo 50/50 o banner ═══ */}
        <div className="relative px-5 pt-0 pb-2 -mt-8">
          <div className="flex items-end gap-3.5">
            {/* Avatar do dono com logo da barbearia sobreposta */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative flex-shrink-0"
              aria-label="Alterar foto de perfil"
            >
              <Avatar className="h-16 w-16 border-[2.5px] border-background shadow-md">
                <AvatarImage src={avatarUrl || undefined} alt="Admin" className="object-cover" />
                <AvatarFallback className="bg-secondary text-foreground text-lg font-semibold">{initials}</AvatarFallback>
              </Avatar>
              {tenantLogo && (
                <div
                  className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-full bg-background border-[2px] border-background shadow-sm overflow-hidden"
                  aria-label="Logo da barbearia"
                >
                  <img src={tenantLogo} alt="Logo" className="h-full w-full object-cover" />
                </div>
              )}
            </button>

            {/* Nome + subtítulo — 100% clean & sério, sem badge Admin e sem status Ativo */}
            <div className="min-w-0 flex-1 pb-1">
              <h2 className="text-[19px] font-bold text-foreground leading-tight truncate">
                {profileName || "Administrador"}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                {tenantName && (
                  <span className="text-[12.5px] text-muted-foreground truncate">
                    {tenantName}
                  </span>
                )}
                {tenantName && (
                  <span className="text-muted-foreground/30 text-[10px]">•</span>
                )}
                <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground shrink-0">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="font-semibold text-foreground">4.9</span>
                </span>
                {unitsCount > 1 && (
                  <>
                    <span className="text-muted-foreground/30 text-[10px]">•</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {unitsCount} unidades
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Link de copiar — lugar estratégico e compacto logo abaixo */}
          {tenantSlug && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="mt-4"
            >
              <CopyCode code={fullLink} label={displayLink} />
            </motion.div>
          )}
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerChange} className="hidden" />

        {/* ═══ ACESSOS PRINCIPAIS ESTRATÉGICOS (3 CARDS 100% SÉRIOS & MINIMALISTAS) ═══ */}
        <div className="grid grid-cols-3 gap-2.5 mt-5 mx-5">
          {/* Card 1: Disparo */}
          <button
            onClick={() => setShowWhenToSend(true)}
            className="relative overflow-hidden flex flex-col justify-between p-3.5 rounded-2xl bg-card border border-border/70 dark:border-white/[0.08] hover:border-foreground/30 active:scale-[0.97] transition-all shadow-xs group text-left min-h-[106px]"
          >
            {/* Ícone de fundo transparente elegante */}
            <Send className="absolute -right-3 -bottom-3 w-16 h-16 text-foreground/[0.035] dark:text-white/[0.04] -rotate-12 transition-transform duration-300 group-hover:scale-110 pointer-events-none stroke-[1.2]" />

            <div className="w-8 h-8 rounded-xl bg-foreground/[0.05] dark:bg-white/[0.07] flex items-center justify-center mb-2.5 relative z-10">
              <Send className="w-4 h-4 text-foreground stroke-[1.8]" />
            </div>

            <div className="relative z-10">
              <span className="text-[13px] font-semibold text-foreground tracking-tight block leading-tight">
                Disparo
              </span>
              <span className="text-[11px] text-muted-foreground block truncate mt-0.5 font-normal">
                Mensagens
              </span>
            </div>
          </button>

          {/* Card 2: WhatsApp (com o tema verdinho aprovado pelo usuário) */}
          <button
            onClick={() => navigate(`${basePath}/whatsapp`)}
            className="relative overflow-hidden flex flex-col justify-between p-3.5 rounded-2xl bg-[#25D366]/[0.03] dark:bg-[#25D366]/[0.05] border border-[#25D366]/25 dark:border-[#25D366]/30 hover:border-[#25D366]/50 active:scale-[0.97] transition-all shadow-xs group text-left min-h-[106px]"
          >
            {/* Efeito de luz sutil no fundo */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#25D366]/[0.08] dark:bg-[#25D366]/[0.10] rounded-full blur-xl pointer-events-none" />
            {/* Ícone de fundo transparente estratégico do WhatsApp */}
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="absolute -right-2.5 -bottom-2.5 w-16 h-16 text-[#25D366]/[0.10] dark:text-[#25D366]/[0.14] -rotate-12 transition-transform duration-300 group-hover:scale-110 pointer-events-none"
              aria-hidden="true"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>

            <div className="w-8 h-8 rounded-xl bg-[#25D366]/15 dark:bg-[#25D366]/20 flex items-center justify-center mb-2.5 relative z-10">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-4 h-4 text-[#25D366]"
                aria-hidden="true"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>

            <div className="relative z-10">
              <span className="text-[13px] font-semibold text-foreground tracking-tight block leading-tight">
                WhatsApp
              </span>
              <span className="text-[11px] text-muted-foreground block truncate mt-0.5 font-normal">
                Atendimento
              </span>
            </div>
          </button>

          {/* Card 3: Campanhas & Promoções */}
          <button
            onClick={() => navigate(`${basePath}/promocoes`)}
            className="relative overflow-hidden flex flex-col justify-between p-3.5 rounded-2xl bg-card border border-border/70 dark:border-white/[0.08] hover:border-foreground/30 active:scale-[0.97] transition-all shadow-xs group text-left min-h-[106px]"
          >
            {/* Ícone de fundo transparente elegante de campanhas */}
            <Megaphone className="absolute -right-2.5 -bottom-2.5 w-16 h-16 text-foreground/[0.035] dark:text-white/[0.04] -rotate-12 transition-transform duration-300 group-hover:scale-110 pointer-events-none stroke-[1.2]" />

            <div className="w-8 h-8 rounded-xl bg-foreground/[0.05] dark:bg-white/[0.07] flex items-center justify-center mb-2.5 relative z-10">
              <Megaphone className="w-4 h-4 text-foreground stroke-[1.8]" />
            </div>

            <div className="relative z-10">
              <span className="text-[13px] font-semibold text-foreground tracking-tight block leading-tight">
                Campanhas
              </span>
              <span className="text-[11px] text-muted-foreground block truncate mt-0.5 font-normal">
                Promoções
              </span>
            </div>
          </button>
        </div>

        {/* ═══ BANNER DE DESTAQUE: CONFIGURAÇÕES DA BARBEARIA (100% SÉRIO & MINIMALISTA, SEM LOGO) ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-4 mx-5"
        >
          <button
            type="button"
            onClick={() => setBarbeariaDrawerOpen(true)}
            className="w-full relative overflow-hidden rounded-2xl border border-border/60 dark:border-white/[0.08] bg-card p-4 text-left active:scale-[0.99] transition-all group shadow-xs hover:border-foreground/30 flex items-center justify-between gap-4"
          >
            <div className="min-w-0 flex-1">
              <span className="text-[14px] font-semibold text-foreground block truncate leading-tight">
                Configurações da Barbearia
              </span>
              <p className="text-[11.5px] text-muted-foreground mt-1 truncate">
                Catálogo, horários, equipe e dados da empresa
              </p>
            </div>
            <div className="w-7 h-7 rounded-full bg-secondary/60 flex items-center justify-center shrink-0 text-muted-foreground group-hover:text-foreground group-hover:bg-secondary transition-colors">
              <ChevronRight className="w-4 h-4" />
            </div>
          </button>
        </motion.div>

        {/* ═══ BANNER DE CONFIGURAÇÃO INICIAL ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="mt-4 mx-5"
        >
          <SetupCompletionBanner
            percentage={setupCompletion.percentage}
            steps={setupCompletion.steps}
            loading={setupCompletion.loading}
            variant="detailed"
          />
        </motion.div>

        {/* ═══ ITENS DE CONFIGURAÇÃO AGRUPADOS (PADRÃO ATENDIMENTO & NOTIFICAÇÕES) ═══ */}
        <div className="mt-5 mx-5 space-y-4">
          {/* Grupo: Gestão & Atendimento Pessoal */}
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-1 mb-2">
              Gestão & Atendimento Pessoal
            </p>
            <div className="rounded-2xl bg-card border border-border/60 dark:border-white/[0.08] overflow-hidden divide-y divide-border/25 dark:divide-white/[0.06] shadow-xs">
              <ProfileMenuItem
                label="Horário de funcionamento"
                description="Seus dias e horários de trabalho"
                onClick={handleHorariosClick}
              />
              <ProfileMenuItem
                label="Serviços"
                description="Duração pessoal e serviços que você atende"
                onClick={() => navigate(`${basePath}/servicos/cortes`)}
              />
              <ProfileMenuItem
                label="Clientes"
                description="Clientes atendidos por você"
                onClick={() => navigate(`${basePath}/meus-clientes`)}
              />
              <ProfileMenuItem
                label="Avaliações"
                description="Notas e comentários dos seus clientes"
                onClick={() => navigate(`${basePath}/avaliacoes`)}
              />
              <ProfileMenuItem
                label="Portfólio"
                description="Fotos dos melhores cortes da barbearia"
                onClick={() => navigate(`${basePath}/portfolio`)}
              />
              <ProfileMenuItem
                label="Relatórios"
                description="Dados e métricas do seu negócio"
                onClick={() => navigate(`${basePath}/relatorios`)}
              />
              <ProfileMenuItem
                label="Suporte"
                description="Fale com nosso time de atendimento"
                onClick={() => window.open("https://wa.me/5511963390043?text=" + encodeURIComponent("Olá! Preciso de suporte no app DUB 🙏"), "_blank", "noopener,noreferrer")}
              />
            </div>
          </div>

          {/* Grupo 2: Conta & Segurança */}
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-1 mb-2">
              Conta & Segurança
            </p>
            <div className="rounded-2xl bg-card border border-border/60 dark:border-white/[0.08] overflow-hidden divide-y divide-border/25 dark:divide-white/[0.06] shadow-xs">
              <ProfileMenuItem
                label="Segurança"
                description="Senha, autenticação e acessos"
                onClick={() => navigate(`${basePath}/seguranca`)}
              />
            </div>
          </div>

          {/* ═══ RODAPÉ: Sair da conta (esq) + Tema claro/escuro (dir) ═══ */}
          <div className="pt-4 pb-8 flex items-center justify-between">
            <button
              onClick={async () => {
                if (loggingOut) return;
                setLoggingOut(true);
                try {
                  await supabase.auth.signOut();
                  localStorage.removeItem("userRole");
                  localStorage.removeItem("barbeiroId");
                  toast.success("Sessão encerrada");
                  window.location.href = "/login";
                } catch {
                  toast.error("Erro ao sair");
                  setLoggingOut(false);
                }
              }}
              disabled={loggingOut}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[13px] font-medium text-accent-red hover:bg-accent-red/10 active:scale-[0.97] transition-all disabled:opacity-60"
            >
              {loggingOut
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <LogOut className="w-3.5 h-3.5" />}
              Sair da conta
            </button>

            <ThemeSegmentedToggle />
          </div>
        </div>

      </div>

      <AvatarEditSheet
        open={avatarEditOpen}
        onOpenChange={setAvatarEditOpen}
        userId={userId}
        initials={initials}
        storagePath="admins"
        selectedFile={selectedFile}
        onAvatarUpdated={(url) => { setAvatarUrl(url); patchProfileCache({ avatarUrl: url }); setSelectedFile(null); }}
      />

      <ApplyScopeSheet
        open={scopeOpen}
        onOpenChange={(o) => {
          setScopeOpen(o);
          if (!o) setScopeConfig(null);
        }}
        tenantId={tenantId}
        title={scopeConfig?.title}
        description={scopeConfig?.description}
        onConfirm={(scope) => scopeConfig?.onConfirm(scope)}
      />

      <WhenToSendDrawer
        isOpen={showWhenToSend}
        onClose={() => setShowWhenToSend(false)}
        onSelectNow={() => navigate(`${basePath}/disparo`)}
        onSelectSchedule={() => navigate(`${basePath}/disparo?mode=schedule`)}
      />

      <SelectBarbeariaDrawer
        open={barbeariaDrawerOpen}
        onClose={() => setBarbeariaDrawerOpen(false)}
        tenantId={tenantId}
        onSelectUnit={(unit) => {
          setBarbeariaDrawerOpen(false);
          navigate(`${basePath}/config-barbearia?unidade=${unit.id}`);
        }}
      />
    </>
  );
}

/* ─── Subcomponent: item 100% sério, alinhado à tipografia do Atendimento & Notificações ─── */
function ProfileMenuItem({ label, description, onClick }: { label: string; description: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-muted/20 active:bg-muted/40 transition-colors group"
    >
      <div className="min-w-0 pr-3">
        <span className="text-[13.5px] font-semibold text-foreground block truncate leading-tight group-hover:text-foreground transition-colors">
          {label}
        </span>
        <span className="text-[11.5px] text-muted-foreground block truncate mt-0.5 leading-snug font-normal">
          {description}
        </span>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/35 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
    </button>
  );
}

/* ─── Campanha: item sério, limpo e sem caixas coloridas ─── */
function CampaignMenuItem({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-card rounded-2xl border border-border/60 shadow-sm p-4 text-left hover:border-border active:scale-[0.99] transition-all flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Megaphone className="h-5 w-5 text-foreground flex-shrink-0" strokeWidth={1.8} />
        <div className="min-w-0">
          <span className="text-[14.5px] font-semibold text-foreground block leading-tight">
            Ative uma campanha
          </span>
          <span className="text-[12px] text-muted-foreground block truncate mt-0.5">
            Atraia mais clientes com promoções
          </span>
        </div>
      </div>
      <span className="text-[11.5px] font-bold bg-foreground text-background px-3.5 py-1.5 rounded-full flex-shrink-0 shadow-sm">
        Criar
      </span>
    </button>
  );
}

