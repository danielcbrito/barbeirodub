import type { SVGProps } from "react";
import { cn } from "@/lib/utils";
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
 * ÍCONE DA CASA — 100% idêntico à referência original:
 * Pentágono suave com topo arredondado, base com cantos arredondados e traço da porta.
 */
export function HomeNavIcon({ active: _active, strokeWidth = 2.1, className, ...props }: NavIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("w-[26px] h-[26px] shrink-0", className)}
      {...props}
    >
      <path d="M10.8 4.2c.7-.6 1.7-.6 2.4 0l6.3 5.8c.4.4.5.9.5 1.5v7c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2v-7c0-.6.2-1.1.5-1.5l6.3-5.8Z" />
      <line x1="12" y1="14.2" x2="12" y2="17.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

/**
 * ÍCONE DA AGENDA — Ícone clássico original com 2 alças e grade.
 */
export function AgendaNavIcon({ active: _active, strokeWidth = 2.1, className, ...props }: NavIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("w-[26px] h-[26px] shrink-0", className)}
      {...props}
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="4" />
      <path d="M3 10h18" />
    </svg>
  );
}

/**
 * ÍCONE DE CHAT / MENSAGENS — 100% idêntico à imagem de referência do usuário:
 * Balão de fala arredondado sólido com 3 pontos internos vazados por máscara transparente.
 */
export function ChatNavIcon({ active: _active, className, ...props }: NavIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("w-5 h-5 shrink-0", className)}
      {...props}
    >
      <mask id="chat-dots-cutout">
        <rect width="24" height="24" fill="white" />
        <circle cx="8" cy="11.5" r="1.3" fill="black" />
        <circle cx="12" cy="11.5" r="1.3" fill="black" />
        <circle cx="16" cy="11.5" r="1.3" fill="black" />
      </mask>
      <path
        mask="url(#chat-dots-cutout)"
        d="M20 11.5c0-4.42-3.8-8-8.5-8S3 7.08 3 11.5c0 2.45 1.18 4.65 3.03 6.13-.15 1.25-.68 2.58-1.53 3.52 1.95 0 3.73-.82 4.98-2.02.65.24 1.34.37 2.02.37 4.7 0 8.5-3.58 8.5-8z"
      />
    </svg>
  );
}

/**
 * ÍCONE DE CONFIGURAÇÕES / ENGRENAGEM — 100% idêntico à imagem de referência do usuário:
 * Engrenagem sólida com orifício central.
 */
export function GearNavIcon({ active, className, ...props }: NavIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("w-5 h-5 shrink-0", className)}
      {...props}
    >
      <path fillRule="evenodd" clipRule="evenodd" d="M11.07 2.05a1 1 0 0 1 1.86 0l.4 1.4a2 2 0 0 0 1.9 1.41h1.46a1 1 0 0 1 .93 1.37l-.56 1.36a2 2 0 0 0 .73 2.3l1.24.78a1 1 0 0 1 0 1.66l-1.24.78a2 2 0 0 0-.73 2.3l.56 1.36a1 1 0 0 1-.93 1.37h-1.46a2 2 0 0 0-1.9 1.41l-.4 1.4a1 1 0 0 1-1.86 0l-.4-1.4a2 2 0 0 0-1.9-1.41H7.07a1 1 0 0 1-.93-1.37l.56-1.36a2 2 0 0 0-.73-2.3l-1.24-.78a1 1 0 0 1 0-1.66l1.24-.78a2 2 0 0 0 .73-2.3l-.56-1.36a1 1 0 0 1 .93-1.37h1.46a2 2 0 0 0 1.9-1.41l.4-1.4zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    </svg>
  );
}

/**
 * ÍCONE DO DISPARO — Ícone de disparo/envio de mensagens (avião de papel de alta precisão).
 */
export function DisparoNavIcon({ active: _active, strokeWidth = 2.1, ...props }: NavIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="27"
      height="27"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      {...props}
    >
      <path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z" />
      <path d="M6 12h16" />
    </svg>
  );
}

/**
 * ÍCONE DO PERFIL — Bonequinho de perfil elegante, organizado e estratégico.
 */
export function ProfileNavIcon({ active: _active, strokeWidth = 2.1, ...props }: NavIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="27"
      height="27"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      {...props}
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/**
 * ÍCONE MENU / GRID 2x2 — 100% idêntico à referência visual (media_1789750683309.png):
 * Quatro círculos concêntricos em formato 2x2 vazados com stroke de alta precisão.
 */
export function MenuGridNavIcon({ active, strokeWidth = 2.1, className, ...props }: NavIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={active ? 2.3 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("w-[26px] h-[26px] shrink-0", className)}
      {...props}
    >
      <circle cx="7" cy="7" r="2.6" />
      <circle cx="17" cy="7" r="2.6" />
      <circle cx="7" cy="17" r="2.6" />
      <circle cx="17" cy="17" r="2.6" />
    </svg>
  );
}

/**
 * ÍCONE DO FINANCEIRO / CARTEIRA — Traço minimalista, elegante e profissional.
 */
export function FinanceiroNavIcon({ active, strokeWidth = 2.1, className, ...props }: NavIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.3 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("w-[26px] h-[26px] shrink-0", className)}
      {...props}
    >
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <path d="M7 7h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7" />
      <circle cx="16" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

const wrap = (Base: React.ComponentType<LucideProps>) =>
  function NavIcon({ active: _active, ...props }: NavIconProps) {
    return <Base {...(props as LucideProps)} />;
  };

export const CalendarNavIcon = wrap(Calendar);
export const SendNavIcon = wrap(Send);
export const StoreNavIcon = wrap(ShoppingCart);
export const SupportNavIcon = wrap(MessageCircle);
