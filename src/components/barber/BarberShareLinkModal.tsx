import React, { useState, useEffect, useRef } from "react";
import {
  Link2,
  Copy,
  Check,
  Share2,
  QrCode,
  Download,
  Smartphone,
  Sparkles,
  ExternalLink,
  ChevronRight,
  User,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { motion, AnimatePresence } from "framer-motion";

interface BarberShareLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barbeiroId?: string;
  barberName?: string;
  tenantSlug?: string | null;
  tenantName?: string;
  targetPhone?: string | null;
  targetClientName?: string | null;
}

/**
 * Normaliza número de telefone brasileiro para link wa.me
 */
function formatWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

export function BarberShareLinkModal({
  open,
  onOpenChange,
  barbeiroId,
  barberName,
  tenantSlug: initialTenantSlug,
  tenantName: initialTenantName,
  targetPhone,
  targetClientName,
}: BarberShareLinkModalProps) {
  const [tenantSlug, setTenantSlug] = useState<string | null>(initialTenantSlug || null);
  const [tenantName, setTenantName] = useState<string>(initialTenantName || "");
  const [resolvedBarberName, setResolvedBarberName] = useState<string>(barberName || "");
  const [loading, setLoading] = useState(false);
  const [linkMode, setLinkMode] = useState<"personal" | "general">("personal");
  const [copied, setCopied] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const qrRef = useRef<HTMLDivElement | null>(null);

  // Busca slug e nome do tenant se não fornecido
  useEffect(() => {
    let mounted = true;
    const fetchTenantData = async () => {
      if (initialTenantSlug && initialTenantName && barberName) {
        setTenantSlug(initialTenantSlug);
        setTenantName(initialTenantName);
        setResolvedBarberName(barberName);
        return;
      }

      try {
        setLoading(true);
        if (barbeiroId) {
          const { data: barb } = await supabase
            .from("barbeiros")
            .select("apelido, tenant_id, tenants:tenant_id(id, slug, nome)")
            .eq("id", barbeiroId)
            .maybeSingle();

          if (!mounted) return;
          if (barb) {
            if (barb.apelido && !barberName) setResolvedBarberName(barb.apelido);
            const tData = barb.tenants as any;
            if (tData?.slug) {
              setTenantSlug(tData.slug);
              if (tData.nome) setTenantName(tData.nome);
              return;
            }

            // Fallback direto na tabela tenants caso join não venha
            if (barb.tenant_id) {
              const { data: directTenant } = await supabase
                .from("tenants")
                .select("slug, nome")
                .eq("id", barb.tenant_id)
                .maybeSingle();

              if (!mounted) return;
              if (directTenant?.slug) {
                setTenantSlug(directTenant.slug);
                if (directTenant.nome) setTenantName(directTenant.nome);
              }
            }
          }
        }
      } catch (err) {
        console.error("Erro ao resolver tenant para link:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (open) {
      fetchTenantData();
    }

    return () => {
      mounted = false;
    };
  }, [open, barbeiroId, initialTenantSlug, initialTenantName, barberName]);

  // Monta as URLs
  const baseUrl = "https://dubagenda.lovable.app";
  const slugPath = tenantSlug || (barbeiroId ? `b/${barbeiroId}` : "");

  const personalLink = slugPath
    ? (barbeiroId && tenantSlug
      ? `${baseUrl}/${slugPath}?barbeiro=${barbeiroId}`
      : `${baseUrl}/${slugPath}`)
    : "";

  const generalLink = slugPath ? `${baseUrl}/${slugPath}` : "";

  const activeLink = linkMode === "personal" ? personalLink : generalLink;
  const displayUrl = activeLink.replace(/^https?:\/\//, "");

  // Mensagem padrão convidando para agendamento
  const greeting = targetClientName ? `Olá, ${targetClientName}!` : "Olá!";
  const barberMention = resolvedBarberName ? ` comigo (${resolvedBarberName})` : "";
  const shopMention = tenantName ? ` na ${tenantName}` : " na barbearia";

  const defaultMessage = linkMode === "personal"
    ? `${greeting} 👋\n\nPara agendar seu horário${barberMention}${shopMention} de forma rápida e escolher o melhor dia e serviço, acesse meu link de agendamento online:\n\n${activeLink}\n\nTe espero lá! 💈✂️`
    : `${greeting} 👋\n\nPara agendar um horário${shopMention} com nossos profissionais, escolha o serviço e horário pelo link oficial:\n\n${activeLink}\n\nSerá um prazer te atender! 💈`;

  // Copiar link para área de transferência
  const handleCopy = async () => {
    if (!activeLink) {
      toast.error("Link ainda não disponível.");
      return;
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(activeLink);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = activeLink;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      toast.success("Link copiado com sucesso! Envie para seus clientes 🔗");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  // Enviar via WhatsApp
  const handleSendWhatsApp = () => {
    if (!activeLink) {
      toast.error("Link indisponível.");
      return;
    }
    const cleanNumber = targetPhone ? formatWhatsAppNumber(targetPhone) : "";
    const waUrl = cleanNumber
      ? `https://wa.me/${cleanNumber}?text=${encodeURIComponent(defaultMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(defaultMessage)}`;

    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  // Compartilhamento nativo (Web Share API para Instagram, Telegram, SMS, etc.)
  const handleNativeShare = async () => {
    if (!activeLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Agende seu horário${barberMention}`,
          text: defaultMessage,
          url: activeLink,
        });
        toast.success("Compartilhado com sucesso!");
      } catch (err: any) {
        if (err.name !== "AbortError") {
          handleCopy();
        }
      }
    } else {
      handleCopy();
    }
  };

  // Download do QR Code como PNG
  const handleDownloadQr = () => {
    if (!qrRef.current) return;
    const svg = qrRef.current.querySelector("svg");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = 1000;
      canvas.height = 1000;
      if (ctx) {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 100, 100, 800, 800);
      }
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `qrcode-${tenantSlug || "barbearia"}${barbeiroId ? `-${resolvedBarberName || "barbeiro"}` : ""}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
      toast.success("QR Code baixado com sucesso! 📸");
    };

    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-w-md mx-auto rounded-t-[28px] border-t border-border/50 bg-background/95 backdrop-blur-xl px-5 pb-8 pt-3 max-h-[92vh] overflow-y-auto no-scrollbar">
        {/* Header no Padrão de Design do Sistema */}
        <div className="flex flex-col items-center text-center pt-2">
          <div className="w-12 h-12 rounded-full bg-foreground/5 border border-border/60 flex items-center justify-center mx-auto text-foreground mb-2.5 shadow-xs">
            <Link2 className="w-6 h-6 stroke-[1.8]" />
          </div>
          <DrawerTitle className="text-[18px] font-semibold tracking-tight text-foreground">
            {targetClientName ? `Enviar link para ${targetClientName}` : "Link de Agendamento"}
          </DrawerTitle>
          <DrawerDescription className="text-[13px] text-muted-foreground leading-relaxed mt-1 max-w-xs">
            {targetPhone
              ? "Envie seu link exclusivo diretamente no WhatsApp deste cliente."
              : "Envie seu link exclusivo para seus clientes agendarem horários com rapidez e praticidade."}
          </DrawerDescription>
        </div>

        {/* ── Segmented Control: Meu Link Direto vs Link da Barbearia ── */}
        {barbeiroId && (
          <div className="mt-5 p-1 bg-secondary/40 dark:bg-white/[0.04] border border-border/40 rounded-xl flex items-center gap-1">
            <button
              type="button"
              onClick={() => setLinkMode("personal")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[12px] font-medium transition-all duration-150 select-none",
                linkMode === "personal"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <User className="w-3.5 h-3.5 stroke-[1.8]" />
              <span>Meu link direto</span>
            </button>
            <button
              type="button"
              onClick={() => setLinkMode("general")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[12px] font-medium transition-all duration-150 select-none",
                linkMode === "general"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Building2 className="w-3.5 h-3.5 stroke-[1.8]" />
              <span>Link da barbearia</span>
            </button>
          </div>
        )}

        {/* ── Card do Link Formatado ── */}
        <div className="mt-4 p-3.5 rounded-2xl bg-secondary/30 dark:bg-white/[0.03] border border-border/50 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-primary/10 text-primary border border-primary/20">
              <Sparkles className="w-3 h-3 stroke-[2]" />
              {linkMode === "personal" ? "Pré-seleciona você" : "Geral da barbearia"}
            </span>

            <button
              type="button"
              onClick={() => window.open(activeLink, "_blank")}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <span>Testar link</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          {/* URL Box com 1-Click Copy */}
          <div
            onClick={handleCopy}
            className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-background/80 border border-border/40 hover:border-border cursor-pointer transition-colors group select-none"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Link2 className="w-4 h-4 text-muted-foreground/60 shrink-0" />
              <span className="text-[12px] font-mono text-foreground/90 truncate tracking-tight">
                {displayUrl || "Carregando link..."}
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all shrink-0 active:scale-95",
                copied
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-secondary text-foreground hover:bg-secondary/80"
              )}
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-500 stroke-[2.4]" />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 stroke-[1.8]" />
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── BOTÕES DE AÇÃO PRINCIPAIS (PADRÃO HIG: 56px Primário, 44px Secundário) ── */}
        <div className="mt-5 space-y-2.5">
          {/* Botão Primário: Enviar no WhatsApp (56px h-14) */}
          <button
            type="button"
            onClick={handleSendWhatsApp}
            disabled={!activeLink}
            className="w-full h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-semibold text-[15px] flex items-center justify-center gap-2.5 transition-all shadow-sm shadow-emerald-600/20 disabled:opacity-50 touch-manipulation cursor-pointer"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.888 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
            <span>{targetPhone ? "Enviar para este cliente" : "Enviar no WhatsApp"}</span>
          </button>

          {/* Botão Secundário: Copiar Link (44px h-11) */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 h-11 rounded-full bg-secondary hover:bg-secondary/80 active:scale-[0.98] text-foreground font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-all border border-border/40 touch-manipulation cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-500 stroke-[2.4]" />
                  <span>Link Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 stroke-[1.8]" />
                  <span>Copiar Link</span>
                </>
              )}
            </button>

            {/* Alternar QR Code (44px) */}
            <button
              type="button"
              onClick={() => setShowQrCode((prev) => !prev)}
              className={cn(
                "h-11 px-4 rounded-full font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-all border touch-manipulation cursor-pointer active:scale-[0.98]",
                showQrCode
                  ? "bg-foreground text-background border-foreground shadow-xs"
                  : "bg-secondary hover:bg-secondary/80 text-foreground border-border/40"
              )}
            >
              <QrCode className="w-4 h-4 stroke-[1.8]" />
              <span>QR Code</span>
            </button>
          </div>

          {/* Compartilhamento nativo do dispositivo */}
          {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="w-full h-11 rounded-full bg-transparent hover:bg-secondary/40 active:scale-[0.98] text-muted-foreground hover:text-foreground text-[13px] font-medium flex items-center justify-center gap-2 transition-colors touch-manipulation"
            >
              <Share2 className="w-3.5 h-3.5 stroke-[1.8]" />
              <span>Outros aplicativos (Instagram, Telegram...)</span>
            </button>
          )}
        </div>

        {/* ── SEÇÃO EXPANSÍVEL: QR CODE PARA MOSTRAR NA BANCADA OU BAIXAR ── */}
        <AnimatePresence>
          {showQrCode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.2, 0.9, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-4 pt-4 border-t border-border/40 flex flex-col items-center text-center">
                <div
                  ref={qrRef}
                  className="p-4 rounded-2xl bg-white border border-border/30 shadow-md inline-block"
                >
                  <QRCodeSVG
                    value={activeLink}
                    size={180}
                    level="H"
                    includeMargin={false}
                  />
                </div>

                <p className="text-[12px] font-medium text-foreground mt-3">
                  Aponte a câmera do celular para agendar
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Mostre a tela para o cliente na cadeira ou baixe para imprimir
                </p>

                <button
                  type="button"
                  onClick={handleDownloadQr}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-secondary text-foreground text-[12px] font-semibold hover:bg-secondary/80 active:scale-95 transition-all border border-border/40"
                >
                  <Download className="w-3.5 h-3.5 stroke-[1.8]" />
                  <span>Baixar imagem para imprimir</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * Card compacto e elegante para embutir diretamente na interface do barbeiro
 * (usado em BarberMobileProfile e BarberConfigBarbearia)
 */
interface BarberShareLinkCardProps {
  barbeiroId?: string;
  barberName?: string;
  tenantSlug?: string | null;
  tenantName?: string;
  className?: string;
}

export function BarberShareLinkCard({
  barbeiroId,
  barberName,
  tenantSlug,
  tenantName,
  className,
}: BarberShareLinkCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const baseUrl = "https://dubagenda.lovable.app";
  const slugPath = tenantSlug || (barbeiroId ? `b/${barbeiroId}` : "");
  const link = slugPath
    ? (barbeiroId && tenantSlug
      ? `${baseUrl}/${slugPath}?barbeiro=${barbeiroId}`
      : `${baseUrl}/${slugPath}`)
    : "";
  const displayUrl = link.replace(/^https?:\/\//, "");

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!link) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(link);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = link;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      toast.success("Link copiado com sucesso! Envie para seus clientes 🔗");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Erro ao copiar link");
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!link) return;

    const barberMention = barberName ? ` com ${barberName}` : "";
    const shopMention = tenantName ? ` na ${tenantName}` : " na barbearia";
    const shareTitle = `Agendamento${barberMention}${shopMention}`;
    const shareText = `Olá! 👋 Agende seu horário${barberMention}${shopMention} de forma rápida e online:\n\n${link}\n\nTe espero lá! 💈✂️`;

    // 1) Chama a gaveta nativa do próprio celular (Web Share API)
    // Permite que o celular abra as opções de WhatsApp, WhatsApp Business, Copiar Link, Instagram, etc.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: link,
        });
        return;
      } catch (err: any) {
        // Se o usuário apenas fechou a gaveta nativa do celular, não faz nada
        if (err?.name === "AbortError") {
          return;
        }
      }
    }

    // 2) Fallback para computadores ou navegadores sem suporte à gaveta nativa
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(link);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = link;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      toast.success("Link copiado com sucesso! 🔗");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setModalOpen(true);
    }
  };

  return (
    <>
      <div
        className={cn(
          "relative overflow-hidden flex items-center justify-between gap-2.5 bg-secondary/35 dark:bg-white/[0.04] border border-border/40 hover:bg-secondary/50 rounded-xl px-3.5 h-11 w-full transition-colors",
          className
        )}
      >
        {/* Lado esquerdo: Ícone discreto de link + URL limpa em linha única (Idêntico ao Admin) */}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer select-none group/link py-1"
          title="Ver opções de envio e QR Code"
        >
          <Link2 className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 stroke-[1.8] group-hover/link:text-foreground transition-colors" />
          <span className="text-[12px] font-mono font-normal text-muted-foreground/80 group-hover/link:text-foreground truncate tracking-tight transition-colors">
            {displayUrl || "dubagenda.lovable.app"}
          </span>
        </button>

        {/* Lado direito: Símbolo de compartilhar que aciona a gaveta nativa do próprio celular */}
        <button
          type="button"
          onClick={handleShare}
          className={cn(
            "h-8 px-2.5 rounded-lg text-[11.5px] font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer select-none shrink-0",
            copied
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
              : "bg-secondary/80 hover:bg-secondary text-foreground border border-border/40"
          )}
          aria-label="Compartilhar link de agendamento"
          title="Compartilhar via WhatsApp, Copiar, etc."
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 stroke-[2.4] text-emerald-500" />
              <span>Copiado!</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5 stroke-[1.8]" />
              <span>Compartilhar</span>
            </>
          )}
        </button>
      </div>

      <BarberShareLinkModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        barbeiroId={barbeiroId}
        barberName={barberName}
        tenantSlug={tenantSlug}
        tenantName={tenantName}
      />
    </>
  );
}

export default BarberShareLinkModal;

