import { cn } from "@/lib/utils";
import maskBody from "@/assets/barber-mask-body.png.asset.json";
import maskLines from "@/assets/barber-mask-lines.png.asset.json";

interface BarberMascotIconProps {
  className?: string;
  /** Classe de cor do corpo (padrão: currentColor). */
  bodyClassName?: string;
  /** Classe de cor dos traços. Se omitido, o mascote fica monocromático. */
  lineClassName?: string;
}

const maskStyle = (url: string): React.CSSProperties => ({
  WebkitMaskImage: `url(${url})`,
  maskImage: `url(${url})`,
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: "bottom center",
  maskPosition: "bottom center",
  WebkitMaskSize: "contain",
  maskSize: "contain",
});

/**
 * Mascote da barbearia como ícone do sistema: duas máscaras CSS
 * (corpo + traços) que herdam cores do tema — nada de imagem "carregando"
 * e funciona igual em modo claro e escuro.
 */
export function BarberMascotIcon({ className, bodyClassName, lineClassName }: BarberMascotIconProps) {
  return (
    <span aria-hidden="true" className={cn("relative block h-full w-full", className)}>
      <span
        className={cn("absolute inset-0 bg-current", bodyClassName)}
        style={maskStyle(maskBody.url)}
      />
      {lineClassName ? (
        <span className={cn("absolute inset-0", lineClassName)} style={maskStyle(maskLines.url)} />
      ) : null}
    </span>
  );
}
