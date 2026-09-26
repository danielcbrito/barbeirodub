import { useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown } from 'lucide-react';

/**
 * TimeWheelPicker — seletor de horário com coluna ÚNICA de valores completos.
 * Cada item mostra "HH:MM" completo (ex: 10:00, 10:05, 10:10).
 * Componente CONTROLADO: valor exibido sempre derivado da prop `value`.
 */

interface TimeWheelPickerProps {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  label?: string;
  minuteStep?: number;
}

const pad = (n: number) => n.toString().padStart(2, '0');
const ITEM_HEIGHT = 56;
const VISIBLE_ITEMS = 5;

/**
 * Gera lista de todos os horários possíveis em steps de minuteStep
 * Ex: minuteStep=5 → ["00:00","00:05","00:10",...,"23:55"]
 */
function generateTimeSlots(minuteStep: number): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += minuteStep) {
      slots.push(`${pad(h)}:${pad(m)}`);
    }
  }
  return slots;
}

/**
 * Encontra o slot mais próximo do valor informado
 */
function snapToSlot(value: string, slots: string[]): string {
  if (slots.includes(value)) return value;
  const [h, m] = (value || '00:00').split(':').map(Number);
  const totalMin = (h || 0) * 60 + (m || 0);
  let closest = slots[0];
  let minDiff = Infinity;
  for (const slot of slots) {
    const [sh, sm] = slot.split(':').map(Number);
    const diff = Math.abs(sh * 60 + sm - totalMin);
    if (diff < minDiff) {
      minDiff = diff;
      closest = slot;
    }
  }
  return closest;
}

export function TimeWheelPicker({ value, onChange, label, minuteStep = 5 }: TimeWheelPickerProps) {
  const slots = generateTimeSlots(minuteStep);
  const snappedValue = snapToSlot(value, slots);

  return (
    <div className="space-y-1.5">
      {label && (
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      )}
      <WheelColumn items={slots} selected={snappedValue} onSelect={onChange} />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Coluna única do wheel picker — CONTROLADA
   Mostra valores completos HH:MM numa lista vertical
   ═══════════════════════════════════════════════ */

interface WheelColumnProps {
  items: string[];
  selected: string;
  onSelect: (item: string) => void;
}

function WheelColumn({ items, selected, onSelect }: WheelColumnProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingProgrammatically = useRef(false);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const selectedIndex = items.indexOf(selected);
  const paddingItems = Math.floor(VISIBLE_ITEMS / 2);

  // Sincronizar scroll com o valor selecionado (via prop)
  useEffect(() => {
    if (!containerRef.current) return;
    const targetOffset = selectedIndex * ITEM_HEIGHT;
    const currentScroll = containerRef.current.scrollTop;

    if (Math.abs(currentScroll - targetOffset) > 2) {
      isScrollingProgrammatically.current = true;
      containerRef.current.scrollTo({ top: targetOffset, behavior: 'smooth' });
      setTimeout(() => {
        isScrollingProgrammatically.current = false;
      }, 350);
    }
  }, [selectedIndex]);

  // Scroll do usuário → emitir onChange
  const handleScroll = useCallback(() => {
    if (isScrollingProgrammatically.current) return;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);

    scrollTimeout.current = setTimeout(() => {
      if (!containerRef.current) return;
      const scrollTop = containerRef.current.scrollTop;
      const index = Math.round(scrollTop / ITEM_HEIGHT);
      const clampedIndex = Math.max(0, Math.min(items.length - 1, index));

      if (items[clampedIndex] !== selected) {
        onSelect(items[clampedIndex]);
      } else {
        isScrollingProgrammatically.current = true;
        containerRef.current.scrollTo({ top: clampedIndex * ITEM_HEIGHT, behavior: 'smooth' });
        setTimeout(() => { isScrollingProgrammatically.current = false; }, 350);
      }
    }, 100);
  }, [items, selected, onSelect]);

  // Clique direto
  const handleItemClick = useCallback((item: string) => {
    if (item !== selected) onSelect(item);
  }, [selected, onSelect]);

  // Setas de navegação
  const navigate = useCallback((direction: 'up' | 'down') => {
    const newIndex = direction === 'up'
      ? Math.max(0, selectedIndex - 1)
      : Math.min(items.length - 1, selectedIndex + 1);
    if (items[newIndex] !== selected) onSelect(items[newIndex]);
  }, [items, selectedIndex, selected, onSelect]);

  return (
    <div className="flex flex-col items-center">
      {/* Seta para cima */}
      <button
        onClick={() => navigate('up')}
        className="p-1 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
        aria-label="Anterior"
        type="button"
      >
        <ChevronUp className="w-5 h-5" />
      </button>

      <div className="relative" style={{ height: ITEM_HEIGHT * VISIBLE_ITEMS, width: '100%', minWidth: 160 }}>
        {/* Highlight da seleção — borda forte e marcante */}
        <div
          className="absolute left-1 right-1 rounded-xl border-2 border-foreground/30 pointer-events-none z-10 shadow-sm"
          style={{ top: paddingItems * ITEM_HEIGHT, height: ITEM_HEIGHT }}
        />

        {/* Gradientes de fade */}
        <div className="absolute top-0 left-0 right-0 h-14 bg-gradient-to-b from-background to-transparent pointer-events-none z-20" />
        <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-background to-transparent pointer-events-none z-20" />

        {/* Container scrollável */}
        <div
          ref={containerRef}
          className="h-full overflow-y-auto scrollbar-hide"
          onScroll={handleScroll}
          style={{
            scrollSnapType: 'y mandatory',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div style={{ height: paddingItems * ITEM_HEIGHT }} />

          {items.map((item) => {
            const isSelected = item === selected;
            return (
              <div
                key={item}
                onClick={() => handleItemClick(item)}
                className={cn(
                  'flex items-center justify-center cursor-pointer select-none transition-all duration-150',
                  isSelected
                    ? 'text-foreground font-bold text-xl'
                    : 'text-muted-foreground/30 font-medium text-base'
                )}
                style={{
                  height: ITEM_HEIGHT,
                  scrollSnapAlign: 'start',
                }}
              >
                {item}
              </div>
            );
          })}

          <div style={{ height: paddingItems * ITEM_HEIGHT }} />
        </div>
      </div>

      {/* Seta para baixo */}
      <button
        onClick={() => navigate('down')}
        className="p-1 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
        aria-label="Próximo"
        type="button"
      >
        <ChevronDown className="w-5 h-5" />
      </button>
    </div>
  );
}
