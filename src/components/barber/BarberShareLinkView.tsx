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
  HelpCircle,
  Instagram,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";
import { BarberContext } from "@/pages/Barbeiro";
import { motion } from "framer-motion";

interface BarberShareLinkViewProps {
  barberContext: BarberContext;
  onBack: () => void;
}

export function BarberShareLinkView({ barberContext, onBack }: BarberShareLinkViewProps) {
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>("");
  const [barberName, setBarberName] = useState<string>(barberContext.apelido || "");
  const [linkMode, setLinkMode] = useState<"personal" | "general">("personal");
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadTenantInfo = async () => {
      try {
        if (barberContext.barbeiroId) {
          const { data: barb } = await supabase
            .from("barbeiros")
            .select("apelido, tenant_id, tenants:tenant_id(id, slug, nome)")
            .eq("id", barberContext.barbeiroId)
            .maybeSingle();

          if (!mounted) return;
          if (barb) {
            if (barb.apelido) setBarberName(barb.apelido);
            const tData = barb.tenants as any;
            if (tData?.slug) {
              setTenantSlug(tData.slug);
              if (tData.nome) setTenantName(tData.nome);
              return;
            }

            const effectiveTenantId = barberContext.tenantId || barb.tenant_id;
            if (effectiveTenantId) {
              const { data: directTenant } = await supabase
                .from("tenants")
                .select("slug, nome")
                .eq("id", effectiveTenantId)
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
        console.error("Erro ao carregar dados do tenant para link:", err);
      }
    };

    loadTenantInfo();
    return () => {
      mounted = false;
    };
  }, [barberContext.barbeiroId, barberContext.tenantId]);

  const baseUrl = "https://dubagenda.lovable.app";
  const slugPath = tenantSlug || (barberContext.barbeiroId ? `b/${barberContext.barbeiroId}` : "");

  const personalLink = slugPath
    ? (barberContext.barbeiroId && tenantSlug
        ? `${baseUrl}/${slugPath}?barbeiro=${barberContext.barbeiroId}`
        : `${baseUrl}/${slugPath}`)
    : "";

  const generalLink = slugPath ? `${baseUrl}/${slugPath}` : "";
  const activeLink = linkMode === "personal" ? personalLink : generalLink;
  const displayUrl = activeLink.replace(/^https?:\/\//, "");

  const greeting = "Olá!";
  const barberMention = barberName ? ` comigo (${barberName})` : "";
  const shopMention = tenantName ? ` na ${tenantName}` : " na barbearia";

  const defaultMessage = linkMode === "personal"
    ? `${greeting} 👋\n\nPara agendar seu horário${barberMention}${shopMention} de forma rápida e escolher o melhor dia e serviço, acesse meu link de agendamento online:\n\n${activeLink}\n\nTe espero lá! 💈✂️`
    : `${greeting} 👋\n\nPara agendar um horário${shopMention} com nossos profissionais, acesse o link oficial e escolha seu horário:\n\n${activeLink}\n\nSerá um prazer te atender! 💈`;

  const handleCopy = async () => {
    if (!activeLink) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(activeLink);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = activeLink;
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

  const handleSendWhatsApp = () => {
    if (!activeLink) return;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(defaultMessage)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  const handleNativeShare = async () => {
    if (!activeLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Agende com ${barberName || "Barbeiro"}`,
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
      downloadLink.download = `qrcode-${tenantSlug || "barbearia"}-${barberName || "barbeiro"}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
      toast.success("QR Code baixado com sucesso! 📸");
    };

    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="pb-16 min-h-app bg-background">
      <ScheduleHeader title="Link de Agendamento" onBack={onBack} />

      <div className="px-4 pt-3 max-w-md mx-auto space-y-4">
        <p className="text-sm text-muted-foreground/70 leading-relaxed font-light">
          Envie seu link exclusivo para seus clientes escolherem serviços e agendarem diretamente na sua cadeira pelo WhatsApp ou redes sociais.
        </p>

        {/* ── Seletor de Tipo de Link ── */}
        <div className="p-1 bg-secondary/40 dark:bg-white/[0.04] border border-border/40 rounded-xl flex items-center gap-1">
          <button
            type="button"
            onClick={() => setLinkMode("personal")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-[12.5px] font-medium transition-all duration-150 select-none",
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
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-[12.5px] font-medium transition-all duration-150 select-none",
              linkMode === "general"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Building2 className="w-3.5 h-3.5 stroke-[1.8]" />
            <span>Link da barbearia</span>
          </button>
        </div>

        {/* ── Card Principal com Link e Botão Copiar ── */}
        <div className="p-4 rounded-2xl bg-card border border-border/50 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
              <Sparkles className="w-3.5 h-3.5 stroke-[2]" />
              {linkMode === "personal" ? "Pré-seleciona seu atendimento" : "Página geral da barbearia"}
            </span>

            <button
              type="button"
              onClick={() => window.open(activeLink, "_blank")}
              className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <span>Abrir página</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          <div
            onClick={handleCopy}
            className="flex items-center justify-between gap-2.5 p-3 rounded-xl bg-secondary/35 dark:bg-white/[0.04] border border-border/40 hover:border-border cursor-pointer transition-colors group select-none"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Link2 className="w-4 h-4 text-muted-foreground/60 shrink-0" />
              <span className="text-[12.5px] font-mono text-foreground/90 truncate tracking-tight">
                {displayUrl || "Gerando link..."}
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11.5px] font-semibold flex items-center gap-1 transition-all shrink-0 active:scale-95",
                copied
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-secondary text-foreground hover:bg-secondary/80 border border-border/40"
              )}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[2.4]" />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 stroke-[1.8]" />
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>

          {/* ── BOTÕES DE AÇÃO: WhatsApp e Copiar ── */}
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={handleSendWhatsApp}
              disabled={!activeLink}
              className="w-full h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-semibold text-[15px] flex items-center justify-center gap-2.5 transition-all shadow-sm shadow-emerald-600/20 disabled:opacity-50 touch-manipulation cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.888 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
              <span>Enviar convite no WhatsApp</span>
            </button>

            {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="w-full h-11 rounded-full bg-secondary hover:bg-secondary/80 active:scale-[0.98] text-foreground font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-all border border-border/40 touch-manipulation cursor-pointer"
              >
                <Share2 className="w-4 h-4 stroke-[1.8]" />
                <span>Compartilhar em outros apps</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Card do QR Code ── */}
        <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-xs flex flex-col items-center text-center">
          <div className="flex items-center gap-2 mb-3">
            <QrCode className="w-4 h-4 text-primary" />
            <h3 className="text-[14px] font-semibold text-foreground">
              QR Code para a bancada
            </h3>
          </div>

          <div
            ref={qrRef}
            className="p-4 rounded-2xl bg-white border border-border/30 shadow-md inline-block my-2"
          >
            <QRCodeSVG
              value={activeLink}
              size={180}
              level="H"
              includeMargin={false}
            />
          </div>

          <p className="text-[12px] font-medium text-foreground mt-3">
            Peça para o cliente apontar a câmera do celular
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xs">
            Ideal para agilizar o próximo agendamento enquanto você finaliza o corte na cadeira.
          </p>

          <button
            type="button"
            onClick={handleDownloadQr}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-secondary hover:bg-secondary/80 text-foreground text-[12.5px] font-semibold active:scale-95 transition-all border border-border/40 shadow-2xs"
          >
            <Download className="w-4 h-4 stroke-[1.8]" />
            <span>Baixar imagem para imprimir</span>
          </button>
        </div>

        {/* ── Dicas de Divulgação ── */}
        <div className="p-4 rounded-2xl bg-secondary/30 dark:bg-white/[0.03] border border-border/40 space-y-2.5">
          <div className="flex items-center gap-2 text-foreground font-semibold text-[13px]">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Onde usar seu link:</span>
          </div>

          <ul className="text-[12px] text-muted-foreground space-y-2 list-none pt-1">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
              <span><strong>Bio do Instagram:</strong> Cole este link no seu perfil pessoal para novos seguidores agendarem com 1 clique.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <span><strong>Status do WhatsApp:</strong> Publique fotos de cortes com seu link na legenda para preencher horários livres.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
              <span><strong>Na cadeira:</strong> Ao terminar o corte, mostre o QR Code na sua tela para o cliente já garantir a próxima visita.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default BarberShareLinkView;
