import { useNavigate } from "react-router-dom";
import { ChevronRight, Sparkles, MessageCircle, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import bannerAiBarber from "@/assets/banner_ai_barber.jpg";
import bannerCampaignsBarber from "@/assets/banner_campaigns_barber.jpg";
import { useTenantSubscription } from "@/hooks/useTenantSubscription";

interface CampaignPromoBannersProps {
  /** Base de rota (ex.: "/admin" ou "/barbeiro"). */
  basePath?: string;
  className?: string;
  tenantId?: string | null;
}

export function CampaignPromoBanners({ basePath = "/admin", className, tenantId }: CampaignPromoBannersProps) {
  const navigate = useNavigate();

  const effectiveTenantId = tenantId || localStorage.getItem("admin_tenant_id") || localStorage.getItem("tenant_id") || null;
  const subscription = useTenantSubscription(effectiveTenantId);

  const handleGoToAiAgent = () => {
    const hasAccess = (subscription.isActive || subscription.isTrial) && !subscription.isExpired;

    if (hasAccess) {
      navigate(`${basePath}/whatsapp?highlight=agente`, { state: { highlight: "agente" } });
    } else {
      navigate(`${basePath}/planos`);
    }
  };

  const handleGoToCampaigns = () => {
    navigate(`${basePath}/promocoes`);
  };

  return (
    <div className={cn("space-y-3.5", className)}>
      {/* ─── 1. BANNER: Agente de IA (Barbeiro cortando sem parar pro WhatsApp) ─── */}
      <div
        onClick={handleGoToAiAgent}
        className="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/10 dark:border-white/10 shadow-md transition-all duration-300 active:scale-[0.99] h-[215px] sm:h-[235px] flex flex-col justify-between p-5 select-none"
      >
        {/* Foto de Fundo com Zoom Suave no Hover */}
        <img
          src={bannerAiBarber}
          alt="Barbeiro atendendo cliente"
          className="absolute inset-0 w-full h-full object-cover object-center filter brightness-[0.72] contrast-[1.05] transition-transform duration-700 ease-out group-hover:scale-105 pointer-events-none"
        />

        {/* Gradiente Cinematográfico Apple Dark */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none bg-gradient-to-t from-[#09090b] via-[#09090b]/65 to-[#09090b]/25"
        />

        {/* Topo do Card: Badge Apple Liquid Glass */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-[11px] font-medium text-white shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse" />
            <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
            <span>Agente de IA no WhatsApp</span>
          </div>

          <span className="text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-md text-white/80 border border-white/10">
            24h Ativo
          </span>
        </div>

        {/* Conteúdo Inferior */}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-3 mt-auto">
          <div className="max-w-md">
            <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white leading-tight">
              Corte sem parar para responder
            </h3>
            <p className="text-[12.5px] text-zinc-300 mt-1 leading-relaxed font-normal line-clamp-2">
              Seu assistente virtual responde dúvidas, envia preços e fecha horários na sua agenda enquanto você trabalha.
            </p>
          </div>

          {/* Botão Cápsula Apple HIG */}
          <div className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black font-semibold text-xs shadow-md group-hover:bg-zinc-100 group-hover:scale-[1.02] transition-all">
            <span>Configurar e ativar</span>
            <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
          </div>
        </div>
      </div>

      {/* ─── 2. BANNER: Campanhas para Novos Clientes (Barbeiro com cliente satisfeito) ─── */}
      <div
        onClick={handleGoToCampaigns}
        className="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/10 dark:border-white/10 shadow-md transition-all duration-300 active:scale-[0.99] h-[215px] sm:h-[235px] flex flex-col justify-between p-5 select-none"
      >
        {/* Foto de Fundo com Zoom Suave no Hover */}
        <img
          src={bannerCampaignsBarber}
          alt="Barbeiro satisfeito cumprimentando novo cliente"
          className="absolute inset-0 w-full h-full object-cover object-center filter brightness-[0.70] contrast-[1.05] transition-transform duration-700 ease-out group-hover:scale-105 pointer-events-none"
        />

        {/* Gradiente Cinematográfico Apple Dark */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none bg-gradient-to-t from-[#09090b] via-[#09090b]/65 to-[#09090b]/25"
        />

        {/* Topo do Card: Badge Apple Liquid Glass */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-[11px] font-medium text-white shadow-xs">
            <Gift className="w-3.5 h-3.5 text-amber-400" />
            <span>Fidelidade & Novos Clientes</span>
          </div>

          <span className="text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-md text-white/80 border border-white/10">
            Crescimento
          </span>
        </div>

        {/* Conteúdo Inferior */}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-3 mt-auto">
          <div className="max-w-md">
            <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white leading-tight">
              Lote sua cadeira com novos clientes
            </h3>
            <p className="text-[12.5px] text-zinc-300 mt-1 leading-relaxed font-normal line-clamp-2">
              Atraia clientes com cupons de primeiro corte, programa de indicação e cartão fidelidade automático.
            </p>
          </div>

          {/* Botão Cápsula Apple HIG */}
          <div className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black font-semibold text-xs shadow-md group-hover:bg-zinc-100 group-hover:scale-[1.02] transition-all">
            <span>Criar campanhas</span>
            <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default CampaignPromoBanners;
