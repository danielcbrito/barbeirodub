import { useNavigate } from "react-router-dom";
import { Gift } from "lucide-react";

/**
 * Empty state para barbeiros (funcionários) da barbearia que ainda não
 * possuem nenhuma campanha/proposta disponível. Somente o dono (tenant admin)
 * cria campanhas — os demais barbeiros veem essa tela minimalista.
 */
export function BarberCampanhaEmpty({ basePath = "/barbeiro" }: { basePath?: string }) {
  const navigate = useNavigate();

  const CurvedBackArrow = ({ className = "" }: { className?: string }) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a4 4 0 0 1 4 4v1" />
    </svg>
  );

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <div className="flex items-center h-14 px-3">
        <button
          type="button"
          onClick={() => navigate(`${basePath}/perfil`)}
          aria-label="Voltar"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground active:opacity-60"
        >
          <CurvedBackArrow />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 -mt-10">
        <div className="w-16 h-16 rounded-2xl bg-secondary/60 flex items-center justify-center mb-5">
          <Gift className="w-7 h-7 text-muted-foreground" strokeWidth={1.6} />
        </div>
        <h2 className="text-[17px] font-semibold text-foreground text-center">
          Ainda não temos uma campanha pra você
        </h2>
        <p className="text-[13px] text-muted-foreground text-center mt-2 max-w-xs leading-relaxed">
          Quando o dono da barbearia criar uma campanha, ela aparecerá aqui pra você acompanhar.
        </p>
      </div>
    </div>
  );
}
