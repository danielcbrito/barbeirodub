import React from "react";

/**
 * Ícones 3D de Barbearia — Apple HIG / Barbearia DUB
 * Geometria limpa, tons escuros e metálicos (aço escovado, titânio, grafite, cromo e prata).
 * ZERO cores fora da paleta (sem laranjas berrantes, sem ilustrações com cara de IA).
 */

/** 1. Horários: Relógio 3D em aço escovado e grafite */
export function IconHorarios3D({ className = "w-11 h-11" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <radialGradient id="clockDialGrad" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#2A2A2E" />
          <stop offset="70%" stopColor="#18181B" />
          <stop offset="100%" stopColor="#0F0F12" />
        </radialGradient>
        <linearGradient id="clockBezelGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#52525B" />
          <stop offset="50%" stopColor="#27272A" />
          <stop offset="100%" stopColor="#18181B" />
        </linearGradient>
        <linearGradient id="clockRimHighlight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A1A1AA" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#3F3F46" stopOpacity="0.2" />
        </linearGradient>
        <filter id="clockShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="3.5" floodColor="#000000" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Bisel externo em aço 3D com sombra */}
      <circle cx="24" cy="24" r="18" fill="url(#clockBezelGrad)" stroke="url(#clockRimHighlight)" strokeWidth="1.2" filter="url(#clockShadow)" />
      
      {/* Mostrador interno rebaixado */}
      <circle cx="24" cy="24" r="14.5" fill="url(#clockDialGrad)" stroke="#111113" strokeWidth="1" />

      {/* Marcadores de hora em relevo cromado */}
      <line x1="24" y1="12" x2="24" y2="15" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="36" y1="24" x2="33" y2="24" stroke="#A1A1AA" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="24" y1="36" x2="24" y2="33" stroke="#71717A" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="12" y1="24" x2="15" y2="24" stroke="#A1A1AA" strokeWidth="1.8" strokeLinecap="round" />

      {/* Marcadores intermediários */}
      <circle cx="32" cy="16" r="1" fill="#71717A" />
      <circle cx="32" cy="32" r="1" fill="#71717A" />
      <circle cx="16" cy="32" r="1" fill="#71717A" />
      <circle cx="16" cy="16" r="1" fill="#71717A" />

      {/* Ponteiro das Horas */}
      <path d="M24 24 L24 16" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" />
      {/* Ponteiro dos Minutos */}
      <path d="M24 24 L31 24" stroke="#D4D4D8" strokeWidth="2" strokeLinecap="round" />

      {/* Coroa central em prata */}
      <circle cx="24" cy="24" r="2.4" fill="#E4E4E7" stroke="#18181B" strokeWidth="0.8" />
      <circle cx="24" cy="24" r="0.9" fill="#FFFFFF" />

      {/* Brilho no vidro */}
      <path d="M14 16 C16 13, 21 11, 28 12 C24 13, 18 16, 14 16 Z" fill="#FFFFFF" opacity="0.12" />
    </svg>
  );
}

/** 2. Clientes: Silhuetas executivas 3D com luz de borda em grafite */
export function IconClientes3D({ className = "w-11 h-11" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="clientBackGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#52525B" />
          <stop offset="100%" stopColor="#27272A" />
        </linearGradient>
        <linearGradient id="clientFrontGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3F3F46" />
          <stop offset="100%" stopColor="#18181B" />
        </linearGradient>
        <linearGradient id="clientStroke" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D4D4D8" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#3F3F46" stopOpacity="0.1" />
        </linearGradient>
        <filter id="clientShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="3.5" floodColor="#000000" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* Usuário Secundário (Atrás) */}
      <circle cx="32" cy="17" r="4.8" fill="url(#clientBackGrad)" stroke="#71717A" strokeWidth="0.8" />
      <path
        d="M26 35 C26 30 28.5 26.5 33 26.5 C37.5 26.5 40 30 40 35"
        fill="url(#clientBackGrad)"
        stroke="#52525B"
        strokeWidth="0.8"
      />

      {/* Sombra de oclusão */}
      <ellipse cx="20" cy="37" rx="10" ry="3" fill="#000000" opacity="0.3" filter="url(#clientShadow)" />

      {/* Usuário Principal (Frente) */}
      <circle
        cx="20"
        cy="18"
        r="6.5"
        fill="url(#clientFrontGrad)"
        stroke="url(#clientStroke)"
        strokeWidth="1.2"
      />
      <path
        d="M10 38 C10 31 14 28 20 28 C26 28 30 31 30 38 Z"
        fill="url(#clientFrontGrad)"
        stroke="url(#clientStroke)"
        strokeWidth="1.2"
      />
      {/* Detalhe minimalista de lapela */}
      <path d="M19 28 L20 32 L21 28" stroke="#A1A1AA" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 3. Serviços: Tesoura de precisão em aço polido 3D */
export function IconServicos3D({ className = "w-11 h-11" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="bladeGrad1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="45%" stopColor="#E4E4E7" />
          <stop offset="100%" stopColor="#71717A" />
        </linearGradient>
        <linearGradient id="bladeGrad2" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D4D4D8" />
          <stop offset="70%" stopColor="#3F3F46" />
          <stop offset="100%" stopColor="#18181B" />
        </linearGradient>
        <filter id="scissorsShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="3.5" floodColor="#000000" floodOpacity="0.35" />
        </filter>
      </defs>

      <g filter="url(#scissorsShadow)">
        {/* Lâmina 1 */}
        <path
          d="M15 11 L24 23 L22.5 24.5 L12 13.5 C13 11.5 14 11 15 11 Z"
          fill="url(#bladeGrad1)"
          stroke="#52525B"
          strokeWidth="0.6"
        />
        {/* Lâmina 2 */}
        <path
          d="M33 11 L24 23 L25.5 24.5 L36 13.5 C35 11.5 34 11 33 11 Z"
          fill="url(#bladeGrad2)"
          stroke="#27272A"
          strokeWidth="0.6"
        />

        {/* Hastes */}
        <path d="M22.5 24.5 L17 31" stroke="#52525B" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M25.5 24.5 L31 31" stroke="#3F3F46" strokeWidth="2.6" strokeLinecap="round" />

        {/* Olhais 3D */}
        <circle cx="15" cy="34" r="4.5" stroke="url(#bladeGrad1)" strokeWidth="2.2" />
        <circle cx="33" cy="34" r="4.5" stroke="url(#bladeGrad2)" strokeWidth="2.2" />
        <path d="M37 32 C38.5 31 40 32 40.5 33.5" stroke="#71717A" strokeWidth="1.6" strokeLinecap="round" />

        {/* Pivô central cromado */}
        <circle cx="24" cy="23.5" r="2.8" fill="#E4E4E7" stroke="#18181B" strokeWidth="0.8" />
        <circle cx="24" cy="23.5" r="1.1" fill="#FFFFFF" />
      </g>
    </svg>
  );
}

/** 4. Carteira: Carteira executiva em couro preto e titânio 3D */
export function IconFinanceiro3D({ className = "w-11 h-11" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="walletBodyGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3F3F46" />
          <stop offset="60%" stopColor="#27272A" />
          <stop offset="100%" stopColor="#18181B" />
        </linearGradient>
        <linearGradient id="cardGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#71717A" />
        </linearGradient>
        <filter id="walletShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="3.5" floodColor="#000000" floodOpacity="0.4" />
        </filter>
      </defs>

      <g filter="url(#walletShadow)">
        {/* Cartão de Crédito saindo da carteira */}
        <rect x="14" y="11" width="20" height="12" rx="2.5" fill="url(#cardGrad)" stroke="#A1A1AA" strokeWidth="0.8" />
        <line x1="16" y1="15" x2="22" y2="15" stroke="#18181B" strokeWidth="1.5" strokeLinecap="round" />

        {/* Corpo da Carteira 3D em couro executivo */}
        <rect
          x="9"
          y="17"
          width="30"
          height="19"
          rx="4"
          fill="url(#walletBodyGrad)"
          stroke="#52525B"
          strokeWidth="1.2"
        />

        {/* Linha de costura sutil de couro */}
        <rect
          x="11"
          y="19"
          width="26"
          height="15"
          rx="3"
          stroke="#71717A"
          strokeWidth="0.6"
          strokeDasharray="2 2"
          fill="none"
        />

        {/* Fecho com botão metálico prateado */}
        <path
          d="M29 23.5 H39.5 C40.3 23.5 41 24.2 41 25 V28 C41 28.8 40.3 29.5 39.5 29.5 H29 C27.3 29.5 26 28.2 26 26.5 C26 24.8 27.3 23.5 29 23.5 Z"
          fill="#18181B"
          stroke="#52525B"
          strokeWidth="0.8"
        />
        <circle cx="31.5" cy="26.5" r="1.6" fill="#D4D4D8" stroke="#18181B" strokeWidth="0.6" />
      </g>
    </svg>
  );
}

/** 5. Campanhas: Megafone 3D executivo em titânio e prata (Sem laranjas!) */
export function IconCampanhas3D({ className = "w-11 h-11" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="titaniumGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E4E4E7" />
          <stop offset="50%" stopColor="#A1A1AA" />
          <stop offset="100%" stopColor="#3F3F46" />
        </linearGradient>
        <linearGradient id="coneGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#52525B" />
          <stop offset="100%" stopColor="#18181B" />
        </linearGradient>
        <filter id="megaShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="3.5" floodColor="#000000" floodOpacity="0.4" />
        </filter>
      </defs>

      <g filter="url(#megaShadow)">
        {/* Cone do Megafone 3D */}
        <path
          d="M17 21 L31 14 V32 L17 25 Z"
          fill="url(#coneGrad)"
          stroke="#71717A"
          strokeWidth="1"
        />
        
        {/* Borda frontal do megafone (Aço cromado 3D) */}
        <ellipse cx="31" cy="23" rx="3.5" ry="9" fill="url(#titaniumGrad)" stroke="#FFFFFF" strokeWidth="0.8" />
        
        {/* Corpo traseiro */}
        <rect x="11" y="20" width="7" height="6" rx="2" fill="#27272A" stroke="#52525B" strokeWidth="0.8" />

        {/* Alça do megafone */}
        <path
          d="M15 26 L15 34 C15 35 16 36 17 35.5 L19 34.5"
          stroke="#71717A"
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        {/* Ondas sonoras sutis em aço */}
        <path d="M37 17 C39 19 40 21 40 23 C40 25 39 27 37 29" stroke="#A1A1AA" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M41 14 C44 17 45 20 45 23 C45 26 44 29 41 32" stroke="#71717A" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      </g>
    </svg>
  );
}

/** 6. Relatórios: Gráfico Isométrico 3D em barras com seta Apple */
export function IconRelatorios3D({ className = "w-11 h-11" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="barGrad1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#52525B" />
          <stop offset="100%" stopColor="#27272A" />
        </linearGradient>
        <linearGradient id="barGrad2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#71717A" />
          <stop offset="100%" stopColor="#3F3F46" />
        </linearGradient>
        <linearGradient id="barGrad3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34C759" />
          <stop offset="100%" stopColor="#15803D" />
        </linearGradient>
        <filter id="chartShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="3.5" floodColor="#000000" floodOpacity="0.4" />
        </filter>
      </defs>

      <g filter="url(#chartShadow)">
        {/* Base / Plataforma 3D */}
        <path d="M10 36 L24 41 L38 36 L24 31 Z" fill="#18181B" stroke="#3F3F46" strokeWidth="0.8" />

        {/* Barra 1 (Baixa) */}
        <rect x="13" y="27" width="5.5" height="9" rx="1.5" fill="url(#barGrad1)" stroke="#52525B" strokeWidth="0.6" />
        <path d="M13 27 L16 25 L21.5 25 L18.5 27 Z" fill="#71717A" />

        {/* Barra 2 (Média) */}
        <rect x="21" y="20" width="5.5" height="16" rx="1.5" fill="url(#barGrad2)" stroke="#71717A" strokeWidth="0.6" />
        <path d="M21 20 L24 18 L29.5 18 L26.5 20 Z" fill="#A1A1AA" />

        {/* Barra 3 (Alta - Verde Apple) */}
        <rect x="29" y="13" width="5.5" height="23" rx="1.5" fill="url(#barGrad3)" stroke="#4ADE80" strokeWidth="0.6" />
        <path d="M29 13 L32 11 L37.5 11 L34.5 13 Z" fill="#86EFAC" />

        {/* Seta de Crescimento 3D ascendente */}
        <path
          d="M13 22 L22 15 L29 18 L36 9"
          stroke="#34C759"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M32 9 H36 V13" stroke="#34C759" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** 7. Ícone 3D sóbrio do Anúncio de Campanha (Sem IA, sem laranja, estilo Apple HIG) */
export function CampaignAdIcon3D({ className = "w-20 h-20" }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="adConeGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#71717A" />
          <stop offset="50%" stopColor="#3F3F46" />
          <stop offset="100%" stopColor="#18181B" />
        </linearGradient>
        <linearGradient id="adRimGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="50%" stopColor="#E4E4E7" />
          <stop offset="100%" stopColor="#71717A" />
        </linearGradient>
        <filter id="adShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#000000" floodOpacity="0.45" />
        </filter>
      </defs>

      <g filter="url(#adShadow)">
        {/* Ticket / Tag de Oferta 3D em titânio atrás */}
        <rect
          x="38"
          y="18"
          width="26"
          height="18"
          rx="3"
          transform="rotate(12 38 18)"
          fill="#27272A"
          stroke="#52525B"
          strokeWidth="1.2"
        />
        <circle cx="43" cy="23" r="2" fill="#71717A" />
        <line x1="48" y1="23" x2="56" y2="25" stroke="#A1A1AA" strokeWidth="1.6" strokeLinecap="round" />

        {/* Megafone 3D Principal */}
        <path
          d="M22 36 L50 22 V56 L22 42 Z"
          fill="url(#adConeGrad)"
          stroke="#52525B"
          strokeWidth="1.5"
        />
        
        {/* Borda frontal cromada */}
        <ellipse cx="50" cy="39" rx="6" ry="17" fill="url(#adRimGrad)" stroke="#FFFFFF" strokeWidth="1.2" />
        
        {/* Tampa traseira */}
        <rect x="14" y="34.5" width="10" height="9" rx="3" fill="#27272A" stroke="#71717A" strokeWidth="1.2" />

        {/* Alça ergonômica */}
        <path
          d="M20 44 L20 58 C20 60 22 61.5 24 60.5 L27 59"
          stroke="#52525B"
          strokeWidth="3.2"
          strokeLinecap="round"
        />

        {/* Linhas acústicas 3D em aço polido */}
        <path d="M60 28 C64 32 66 36 66 39 C66 42 64 46 60 50" stroke="#E4E4E7" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M67 22 C73 28 75 34 75 39 C75 44 73 50 67 56" stroke="#71717A" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      </g>
    </svg>
  );
}

/** 8. Ícone clássico de poste de barbearia (retrocompatibilidade) */
export function IconBarbearia3D({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="barberSteel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#27272A" />
          <stop offset="100%" stopColor="#09090B" />
        </linearGradient>
        <clipPath id="cylinderClipSmall">
          <rect x="12" y="6.5" width="8" height="17" rx="4" />
        </clipPath>
      </defs>
      <rect x="10.5" y="4" width="11" height="2.5" rx="1.25" fill="#3F3F46" />
      <circle cx="16" cy="3.5" r="1.5" fill="#71717A" />
      <rect x="12" y="6.5" width="8" height="17" rx="4" fill="#F4F4F5" />
      <g clipPath="url(#cylinderClipSmall)">
        <path d="M10 8 L22 20" stroke="url(#barberSteel)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M10 14 L22 26" stroke="#71717A" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M10 2 L22 14" stroke="url(#barberSteel)" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <rect x="12" y="6.5" width="8" height="17" rx="4" stroke="#D4D4D8" strokeWidth="1" />
      <rect x="10.5" y="23.5" width="11" height="2.5" rx="1.25" fill="#3F3F46" />
      <path d="M10 10 H7.5 V20 H10" stroke="#52525B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 9. Pino de Localização Sólido em vermelho cirúrgico Apple */
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
