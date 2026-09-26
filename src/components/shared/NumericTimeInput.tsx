import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface NumericTimeInputProps {
  /** Valor no formato HH:MM */
  value: string;
  onChange: (time: string) => void;
  className?: string;
  placeholder?: string;
}

/**
 * Input de horário com teclado numérico e auto-formatação HH:MM.
 */
export function NumericTimeInput({ value, onChange, className, placeholder = 'HH:MM' }: NumericTimeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [displayValue, setDisplayValue] = useState(() => value || '');

  useEffect(() => {
    if (value !== displayValue.replace(/[^0-9:]/g, '')) {
      setDisplayValue(value || '');
    }
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, '');
    if (raw.length > 4) raw = raw.slice(0, 4);

    // Auto-formata com dois pontos
    let formatted = '';
    if (raw.length >= 3) {
      formatted = `${raw.slice(0, 2)}:${raw.slice(2)}`;
    } else {
      formatted = raw;
    }

    setDisplayValue(formatted);

    // Só emite quando temos horário completo e válido
    if (raw.length === 4) {
      const h = parseInt(raw.slice(0, 2), 10);
      const m = parseInt(raw.slice(2, 4), 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        onChange(`${raw.slice(0, 2)}:${raw.slice(2)}`);
      }
    }
  }, [onChange]);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={displayValue}
      onChange={handleChange}
      maxLength={5}
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