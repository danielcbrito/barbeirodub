import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface NumericDateInputProps {
  /** Valor no formato yyyy-MM-dd (ISO) */
  value: string;
  onChange: (isoDate: string) => void;
  className?: string;
  placeholder?: string;
  min?: string;
}

/**
 * Input de data com teclado numérico e auto-formatação DD/MM/AAAA.
 * Armazena internamente no formato ISO (yyyy-MM-dd).
 */
export function NumericDateInput({ value, onChange, className, placeholder = 'DD/MM/AAAA', min }: NumericDateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  /** Converte ISO → display */
  const isoToDisplay = (iso: string): string => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return '';
    return `${d}/${m}/${y}`;
  };

  /** Converte display → ISO */
  const displayToIso = (display: string): string => {
    const clean = display.replace(/\D/g, '');
    if (clean.length < 8) return '';
    const d = clean.slice(0, 2);
    const m = clean.slice(2, 4);
    const y = clean.slice(4, 8);
    const day = parseInt(d, 10);
    const month = parseInt(m, 10);
    const year = parseInt(y, 10);
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2020) return '';
    return `${y}-${m}-${d}`;
  };

  const [displayValue, setDisplayValue] = useState(() => isoToDisplay(value));

  useEffect(() => {
    const expected = isoToDisplay(value);
    if (expected !== displayValue && displayToIso(displayValue) !== value) {
      setDisplayValue(expected);
    }
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, '');
    if (raw.length > 8) raw = raw.slice(0, 8);

    // Auto-formata com barras
    let formatted = '';
    if (raw.length >= 5) {
      formatted = `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4)}`;
    } else if (raw.length >= 3) {
      formatted = `${raw.slice(0, 2)}/${raw.slice(2)}`;
    } else {
      formatted = raw;
    }

    setDisplayValue(formatted);

    // Só emite ISO quando temos data completa válida
    if (raw.length === 8) {
      const iso = displayToIso(formatted);
      if (iso) {
        if (min && iso < min) return; // não permite datas anteriores ao mínimo
        onChange(iso);
      }
    } else {
      onChange('');
    }
  }, [onChange, min]);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={displayValue}
      onChange={handleChange}
      maxLength={10}
      className={cn(
        'flex w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'h-11',
        className
      )}
    />
  );
}