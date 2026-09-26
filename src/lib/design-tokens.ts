/**
 * DUB Barber - Design Tokens (Red Premium Theme)
 * Single source of truth for colors, radii, and spacing.
 * Use these constants in any JS/TS logic that needs raw values.
 * For Tailwind classes, prefer the CSS custom-properties defined in index.css.
 */

export const COLORS = {
  bg:            '#0D0D0D',
  surface:       '#171717',
  surfaceHover:  'rgba(255,255,255,0.04)',
  border:        'rgba(255,255,255,0.08)',
  borderHover:   'rgba(255,255,255,0.14)',
  textPrimary:   '#F8F8F8',
  textSecondary: '#8F8F8F',
  textMuted:     '#5A5A5A',
  textDisabled:  '#2D2D35',
  primary:       '#B8351E',
  primaryGlow:   '#CC4328',
  success:       '#34D399',
  warning:       '#F59E0B',
  danger:        '#EF4444',
} as const;

export const RADIUS = {
  button: '0.5rem',
  card:   '0.5rem',
  modal:  '0.625rem',
  badge:  '9999px',
} as const;
