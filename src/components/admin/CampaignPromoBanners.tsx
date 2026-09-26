import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import whatsappLogo from "@/assets/whatsapp-logo.png";
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
    // Se a barbearia tem plano ativo ou período de testes com Agente de IA:
    const hasAccess = (subscription.isActive || subscription.isTrial) && !subscription.isExpired;

    if (hasAccess) {
      navigate(`${basePath}/whatsapp?highlight=agente`, { state: { highlight: "agente" } });
    } else {
      // Direciona para a tela de planos
      navigate(`${basePath}/planos`);
    }
  };

  const handleGoToCampaigns = () => {
    navigate(`${basePath}/promocoes`);
  };

  return (
    <div className={cn("space-y-3.5", className)}>
      {/* ─── 1. BANNER NOVO (TOPO): Agente de IA ─── */}
      <div
        onClick={handleGoToAiAgent}
        className="group relative cursor-pointer overflow-hidden rounded-[26px] bg-[#18191d] text-white border border-emerald-500/20 shadow-md transition-all duration-300 hover:border-emerald-500/40 active:scale-[0.99] p-5 sm:p-6"
        style={{
          backgroundImage: "radial-gradient(circle at 85% 45%, rgba(37,211,102,0.14) 0%, rgba(16,185,129,0.05) 45%, transparent 70%)",
        }}
      >
        {/* Ícone do WhatsApp ao fundo bem desfocado e elegante */}
        <img
          src={whatsappLogo}
          alt=""
          aria-hidden="true"
          className="absolute -right-3 -bottom-4 w-32 h-32 sm:w-36 sm:h-36 object-contain opacity-[0.16] filter blur-[0.8px] pointer-events-none select-none transition-transform duration-500 group-hover:scale-105"
        />

        <div className="relative z-10 flex flex-col justify-between">
          <div>
            <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white leading-snug">
              Agente de IA
            </h3>
            <p className="text-xs sm:text-sm text-white/75 mt-1 leading-relaxed max-w-md">
              Atende clientes, responde dúvidas e agenda horários de forma 100% automatizada 24h direto pelo seu WhatsApp.
            </p>
          </div>

          {/* Botão: Configure e ative */}
          <div className="mt-4 flex items-center justify-between bg-black/45 hover:bg-black/65 border border-white/15 rounded-full py-1.5 pl-4 pr-1.5 transition-all max-w-xs shadow-sm">
            <span className="text-xs sm:text-sm font-semibold text-white tracking-wide">
              Configurar e ativar
            </span>
            <div className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform shrink-0">
              <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
          </div>
        </div>
      </div>

      {/* ─── 2. BANNER DE CAMPANHAS (ABAIXO): Efeito vermelho e notas de dinheiro de fundo ─── */}
      <div
        onClick={handleGoToCampaigns}
        className="group relative cursor-pointer overflow-hidden rounded-[26px] bg-[#18191d] text-white border border-rose-500/20 shadow-md transition-all duration-300 hover:border-rose-500/40 active:scale-[0.99] p-5 sm:p-6"
        style={{
          backgroundImage: "radial-gradient(circle at 85% 45%, rgba(239,68,68,0.15) 0%, rgba(244,63,94,0.06) 45%, transparent 70%)",
        }}
      >
        {/* Marca d'água de notas de dinheiro no fundo */}
        <div className="absolute -right-2 -bottom-2 w-32 h-32 sm:w-36 sm:h-36 pointer-events-none select-none opacity-[0.14] filter blur-[0.4px] transition-transform duration-500 group-hover:scale-105 flex items-center justify-center">
          <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" className="w-full h-full text-rose-400">
            {/* Nota 1 inclinada */}
            <g transform="rotate(-18 45 42)">
              <rect x="12" y="24" width="62" height="34" rx="4" strokeWidth="2.4" />
              <circle cx="43" cy="41" r="8.5" strokeWidth="2" />
              <path d="M43 35.5v11M40 38.5h6" strokeWidth="1.8" strokeLinecap="round" />
            </g>
            {/* Nota 2 inclinada caindo */}
            <g transform="rotate(16 68 62)" opacity="0.85">
              <rect x="36" y="44" width="56" height="30" rx="3.5" strokeWidth="2.2" />
              <circle cx="64" cy="59" r="7" strokeWidth="1.9" />
              <path d="M64 54.5v9M61.5 56.8h5" strokeWidth="1.7" strokeLinecap="round" />
            </g>
          </svg>
        </div>

        <div className="relative z-10 flex flex-col justify-between">
          <div>
            <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white leading-snug">
              Campanhas para novos clientes
            </h3>
            <p className="text-xs sm:text-sm text-white/75 mt-1 leading-relaxed max-w-md">
              Atraia clientes com cupons, indicações e fidelidade para lotar sua agenda e faturar mais.
            </p>
          </div>

          {/* Botão: Configure e ative */}
          <div className="mt-4 flex items-center justify-between bg-black/45 hover:bg-black/65 border border-white/15 rounded-full py-1.5 pl-4 pr-1.5 transition-all max-w-xs shadow-sm">
            <span className="text-xs sm:text-sm font-semibold text-white tracking-wide">
              Configurar e ativar
            </span>
            <div className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform shrink-0">
              <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CampaignPromoBanners;
