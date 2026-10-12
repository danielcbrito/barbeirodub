import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { BarberMascotIcon } from "./BarberMascotIcon";

interface CampaignPromoBannersProps {
  /** Base de rota (ex.: "/admin" ou "/barbeiro"). */
  basePath?: string;
  className?: string;
}


const CAMPAIGNS = [
  {
    key: "convide",
    index: "01",
    title: "Convide e ganhe",
    subtitle: "O cliente indica, o cliente ganha.",
  },
  {
    key: "fidelidade",
    index: "02",
    title: "Fidelidade",
    subtitle: "A cada X cortes, uma recompensa.",
  },
  {
    key: "cliente-mes",
    index: "03",
    title: "Cliente do mês",
    subtitle: "Quem mais indicar leva o prêmio.",
  },
] as const;

/**
 * Bloco de campanhas — peça de anúncio dentro do app.
 * Banner vermelho com mascote em preto e branco + cards de campanha.
 */
export function CampaignPromoBanners({ basePath = "/admin", className }: CampaignPromoBannersProps) {
  const navigate = useNavigate();
  const go = () => navigate(`${basePath}/promocoes`);

  return (
    <div className={cn("space-y-3", className)}>
      {/* ─── Anúncio principal ─── */}
      <button
        onClick={go}
        className="group relative block w-full overflow-hidden rounded-2xl text-left transition-opacity active:opacity-95"
        style={{
          background:
            "linear-gradient(105deg, hsl(10 78% 36%) 0%, hsl(10 78% 44%) 62%, hsl(10 78% 40%) 100%)",
        }}
      >
        <div className="relative flex min-h-[116px] items-stretch gap-3 px-5 py-4 sm:min-h-[144px] sm:px-7 sm:py-5">
          <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-center">
            <h3 className="text-[13.5px] font-bold leading-tight tracking-tight text-primary-foreground sm:text-[22px]">
              Crie sua primeira campanha
            </h3>
            <p className="mt-1 whitespace-nowrap text-[12px] leading-snug text-primary-foreground/75 sm:text-[14px]">
              Atraia novos clientes para você.
            </p>
            <span className="mt-3 inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full bg-primary-foreground px-4 py-1.5 text-[12.5px] font-semibold text-[hsl(10_78%_36%)] sm:px-5 sm:py-1.5 sm:text-[13.5px]">
              Criar campanha
              <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
            </span>
          </div>

          {/* mascote como ícone do sistema — máscara CSS, cor herdada, encostado na base */}
          <div className="pointer-events-none relative -mb-4 -mr-2 flex w-[34%] min-w-[96px] max-w-[170px] shrink-0 items-end justify-end self-stretch text-primary-foreground sm:-mb-5 sm:-mr-3 sm:w-[38%] sm:min-w-[150px] sm:max-w-[250px]">

            <BarberMascotIcon
              className="-scale-x-100"
              lineClassName="bg-[hsl(0_0%_10%)]"
            />
          </div>


        </div>
      </button>

      {/* ─── Cards de campanha ─── */}
      <div className="grid grid-cols-3 gap-2.5">
        {CAMPAIGNS.map((c) => (
          <button
            key={c.key}
            onClick={go}
            className="group flex h-full flex-col rounded-2xl border border-border bg-card px-3.5 py-3.5 text-left transition-colors hover:border-primary/40 hover:bg-card-elevated active:bg-card-elevated"
          >
            <span className="text-[10px] font-semibold tabular-nums text-primary">{c.index}</span>
            <span className="mt-2 text-[12.5px] font-semibold leading-tight text-foreground">
              {c.title}
            </span>
            <span className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {c.subtitle}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default CampaignPromoBanners;
