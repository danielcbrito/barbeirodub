import type { SVGProps } from "react";
import {
  Calendar,
  Send,
  User,
  ShoppingCart,
  MessageCircle,
  type LucideProps,
} from "lucide-react";

interface NavIconProps extends SVGProps<SVGSVGElement> {
  /** Mantido por compatibilidade — os ícones são sempre outline. */
  active?: boolean;
}

/**
 * ÍCONE DA CASA — SVG autoral (NÃO usar `Home`/`House` do lucide).
 * Path único fechado: telhado contínuo + porta em arco (raio 2.5) na base.
 * viewBox 0 0 24 24, fill="none", linecap/linejoin "round", strokeWidth via prop.
 */
export function HomeNavIcon({ active: _active, strokeWidth = 1.8, ...props }: NavIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3.6 10.4 12 3.2l8.4 7.2V20a1 1 0 0 1-1 1h-4.9v-5.5a2.5 2.5 0 0 0-5 0V21H4.6a1 1 0 0 1-1-1v-9.6Z" />
    </svg>
  );
}

/**
 * ÍCONE DA AGENDA — SVG autoral, mesma gramática da casa.
 * Moldura arredondada + duas argolas + linha do cabeçalho.
 */
export function AgendaNavIcon({ active: _active, strokeWidth = 1.8, ...props }: NavIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M4.5 6.6h15a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V7.6a1 1 0 0 1 1-1Z" />
      <path d="M3.5 11h17" />
      <path d="M8.2 3.2v3.4" />
      <path d="M15.8 3.2v3.4" />
      <path d="M8 15.2h3" />
    </svg>
  );
}

/**
 * ÍCONE DO DISPARO — SVG autoral, avião de papel em traço contínuo.
 */
export function DisparoNavIcon({ active: _active, strokeWidth = 1.8, ...props }: NavIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M20.6 3.4 3.9 10.1a.7.7 0 0 0 .05 1.31l6.35 2.29 2.29 6.35a.7.7 0 0 0 1.31.05L20.6 3.4Z" />
      <path d="M20.6 3.4 10.3 13.7" />
    </svg>
  );
}

const wrap = (Base: React.ComponentType<LucideProps>) =>
  function NavIcon({ active: _active, ...props }: NavIconProps) {
    return <Base {...(props as LucideProps)} />;
  };

export const CalendarNavIcon = wrap(Calendar);
export const SendNavIcon = wrap(Send);
export const ProfileNavIcon = wrap(User);
export const StoreNavIcon = wrap(ShoppingCart);
export const SupportNavIcon = wrap(MessageCircle);
