import React from "react";

/**
 * Ícones de Categorias — 100% Sério, Minimalista, Estilo Barbearia Americana.
 * Geometria limpa, estilo vetorial de alta precisão em tons escuros e grafite (sem estética infantil ou colorida).
 */

/** 1. Barbearia: Poste clássico estilo barbearia americana em aço escuro e grafite */
export function IconBarbearia3D({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="barberSteel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#27272A" />
          <stop offset="100%" stopColor="#09090B" />
        </linearGradient>
      </defs>
      {/* Top Cap */}
      <rect x="10.5" y="4" width="11" height="2.5" rx="1.25" fill="#3F3F46" />
      <circle cx="16" cy="3.5" r="1.5" fill="#71717A" />
      {/* Cylinder Body */}
      <rect x="12" y="6.5" width="8" height="17" rx="4" fill="#F4F4F5" />
      <g clipPath="url(#cylinderClip)">
        <path d="M10 8 L22 20" stroke="url(#barberSteel)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M10 14 L22 26" stroke="#71717A" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M10 2 L22 14" stroke="url(#barberSteel)" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <clipPath id="cylinderClip">
        <rect x="12" y="6.5" width="8" height="17" rx="4" />
      </clipPath>
      {/* Cylinder outline */}
      <rect x="12" y="6.5" width="8" height="17" rx="4" stroke="#D4D4D8" strokeWidth="1" />
      {/* Bottom Cap */}
      <rect x="10.5" y="23.5" width="11" height="2.5" rx="1.25" fill="#3F3F46" />
      {/* Wall Bracket */}
      <path d="M10 10 H7.5 V20 H10" stroke="#52525B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 2. Horários: Relógio de precisão minimalista em aço grafite */
export function IconHorarios3D({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Outer ring */}
      <circle cx="16" cy="16" r="11.5" stroke="#27272A" strokeWidth="2.2" />
      {/* Hour ticks */}
      <line x1="16" y1="7" x2="16" y2="9.5" stroke="#71717A" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="25" y1="16" x2="22.5" y2="16" stroke="#71717A" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="16" y1="25" x2="16" y2="22.5" stroke="#71717A" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="7" y1="16" x2="9.5" y2="16" stroke="#71717A" strokeWidth="1.6" strokeLinecap="round" />
      {/* Hands */}
      <path d="M16 16 L16 10" stroke="#18181B" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 16 L20.5 16" stroke="#18181B" strokeWidth="2" strokeLinecap="round" />
      {/* Center Pivot */}
      <circle cx="16" cy="16" r="1.6" fill="#18181B" />
    </svg>
  );
}

/** 3. Clientes: Silhuetas executivas sobrepostas em grafite sério */
export function IconClientes3D({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Back User */}
      <circle cx="21" cy="12" r="3" fill="#A1A1AA" />
      <path d="M17.5 22.5 C17.5 19.5 19 18 22 18 C25 18 26.5 19.5 26.5 22.5" stroke="#A1A1AA" strokeWidth="1.6" strokeLinecap="round" />
      {/* Front User */}
      <circle cx="13" cy="13" r="3.75" fill="#27272A" />
      <path d="M7 24.5 C7 20.5 9.5 18.5 13 18.5 C16.5 18.5 19 20.5 19 24.5" fill="#27272A" />
    </svg>
  );
}

/** 4. Serviços: Tesoura de precisão em aço fosco e grafite */
export function IconServicos3D({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Blades */}
      <path d="M10 8 L22 20" stroke="#18181B" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M22 8 L10 20" stroke="#71717A" strokeWidth="2.2" strokeLinecap="round" />
      {/* Center Pivot */}
      <circle cx="16" cy="14" r="1.6" fill="#18181B" />
      {/* Handles */}
      <circle cx="9" cy="22" r="3" stroke="#71717A" strokeWidth="1.8" />
      <circle cx="23" cy="22" r="3" stroke="#18181B" strokeWidth="1.8" />
    </svg>
  );
}

/** 5. Financeiro: Carteira executiva minimalista em grafite escuro */
export function IconFinanceiro3D({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Card peaking out */}
      <rect x="9" y="8" width="14" height="6" rx="1.5" fill="#71717A" />
      {/* Wallet body */}
      <rect x="6" y="11" width="20" height="14" rx="2.5" fill="#27272A" />
      {/* Wallet flap / clasp */}
      <path d="M20 16 H26 V20 H20 C18.8954 20 18 19.1046 18 18 C18 16.8954 18.8954 16 20 16 Z" fill="#18181B" />
      <circle cx="21.5" cy="18" r="1" fill="#D4D4D8" />
    </svg>
  );
}

/** 6. Mais: Matriz 3x2 de pontos/quadrados minimalistas */
export function IconMais3D({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="4.5" y="6" width="3.5" height="3.5" rx="1" fill="#71717A" />
      <rect x="10.25" y="6" width="3.5" height="3.5" rx="1" fill="#71717A" />
      <rect x="16" y="6" width="3.5" height="3.5" rx="1" fill="#71717A" />
      <rect x="4.5" y="14.5" width="3.5" height="3.5" rx="1" fill="#71717A" />
      <rect x="10.25" y="14.5" width="3.5" height="3.5" rx="1" fill="#71717A" />
      <rect x="16" y="14.5" width="3.5" height="3.5" rx="1" fill="#71717A" />
    </svg>
  );
}

/** Pino de Localização Sólido e Grosso em vermelho com centro branco (Fiel ao mockup) */
export function PinLocationSolid({ className = "w-3.5 h-3.5 shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 1C4.68629 1 2 3.68629 2 7C2 11.25 8 15.5 8 15.5C8 15.5 14 11.25 14 7C14 3.68629 11.3137 1 8 1ZM8 9C9.10457 9 10 8.10457 10 7C10 5.89543 9.10457 5 8 5C6.89543 5 6 5.89543 6 7C6 8.10457 6.89543 9 8 9Z"
        fill="#EF4444"
      />
      <circle cx="8" cy="7" r="1.8" fill="#FFFFFF" />
    </svg>
  );
}

/**
 * Ícone de Calendário 100% idêntico à imagem de referência do usuário:
 * Corpo cinza sólido (#9CA3AF) com ganchos, linha e folhas de calendário em BRANCO (#FFFFFF).
 */
export function MockupCalendarIcon({ className = "w-5 h-5 shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Corpo cinza do calendário */}
      <rect x="2.5" y="4.5" width="15" height="13" rx="3.5" fill="#9CA3AF" />
      {/* 2 ganchos superiores em cinza com contorno branco */}
      <rect x="6" y="2" width="1.8" height="3.5" rx="0.9" fill="#9CA3AF" stroke="#FFFFFF" strokeWidth="0.6" />
      <rect x="12.2" y="2" width="1.8" height="3.5" rx="0.9" fill="#9CA3AF" stroke="#FFFFFF" strokeWidth="0.6" />
      {/* Linha divisória horizontal em branco */}
      <line x1="2.5" y1="8.5" x2="17.5" y2="8.5" stroke="#FFFFFF" strokeWidth="1.2" />
      {/* Folhas/marcações internas do calendário em branco */}
      <rect x="5.5" y="11" width="2" height="1.8" rx="0.5" fill="#FFFFFF" />
      <rect x="9" y="11" width="2" height="1.8" rx="0.5" fill="#FFFFFF" />
      <rect x="12.5" y="11" width="2" height="1.8" rx="0.5" fill="#FFFFFF" />
    </svg>
  );
}

/**
 * Ícone de Relógio 100% idêntico à imagem de referência do usuário:
 * Círculo cinza sólido (#9CA3AF) com ponteiros em BRANCO (#FFFFFF).
 */
export function MockupClockIcon({ className = "w-5 h-5 shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Círculo cinza sólido */}
      <circle cx="10" cy="10" r="7.5" fill="#9CA3AF" />
      {/* Ponteiros recortados em branco */}
      <path
        d="M10 5.8V10L12.8 11.8"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
