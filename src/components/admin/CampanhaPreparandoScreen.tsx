import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { BarberMascotIcon } from "./BarberMascotIcon";
import { Button } from "@/components/ui/button";

interface CampanhaPreparandoScreenProps {
  basePath?: string;
}

/**
 * Tela de bloqueio para a área de campanhas.
 * Enquanto a funcionalidade está em preparação, todos os caminhos que levam
 * ao hub de campanhas exibem esta tela, impedindo acesso ao conteúdo real.
 */
export function CampanhaPreparandoScreen({ basePath = "/admin" }: CampanhaPreparandoScreenProps) {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[var(--app-height,100dvh)] flex-col items-center justify-center bg-background px-6 text-center">
      <div className="relative flex max-w-xs flex-col items-center gap-6">
        <div className="relative flex h-32 w-32 items-center justify-center text-foreground">
          <BarberMascotIcon className="h-full w-full text-foreground" lineClassName="bg-background" />
        </div>

        <div className="space-y-2">
          <h1 className="text-[17px] font-semibold leading-tight text-foreground">
            Estamos preparando esse ambiente
          </h1>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            para você atrair novos clientes para você.
          </p>
          <p className="text-[12px] leading-relaxed text-muted-foreground/70">
            Em breve essa novidade estará disponível para você usar.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(basePath, { replace: true })}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </div>
    </div>
  );
}

export default CampanhaPreparandoScreen;

