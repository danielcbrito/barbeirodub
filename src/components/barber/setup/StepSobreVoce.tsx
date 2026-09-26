import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/validators";

export interface SobreVoceData {
  nome_barbearia: string;
  nome_completo: string;
  telefone: string;
}

interface Props {
  data: SobreVoceData;
  onChange: (data: SobreVoceData) => void;
  errors: Partial<Record<keyof SobreVoceData, string>>;
}

/**
 * Step 1 — Sobre Você: nome comercial, nome completo, telefone.
 * Inputs com label outlined (label corta a borda) + seletor de código do país.
 */
export function StepSobreVoce({ data, onChange, errors }: Props) {
  const update = (field: keyof SobreVoceData, value: string) => {
    let formatted = value;
    if (field === "telefone") formatted = formatPhone(value);
    onChange({ ...data, [field]: formatted });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[26px] font-bold text-foreground leading-tight tracking-tight">
          Sobre você
        </h2>
        <p className="text-[14px] text-foreground/90 mt-1.5">
          Conte-nos mais sobre você e sua empresa.
        </p>
      </div>

      <div className="space-y-5">
        <OutlinedField
          label="Nome comercial"
          value={data.nome_barbearia}
          onChange={(v) => update("nome_barbearia", v)}
          error={errors.nome_barbearia}
        />

        <OutlinedField
          label="Nome e Sobrenome"
          value={data.nome_completo}
          onChange={(v) => update("nome_completo", v)}
          error={errors.nome_completo}
        />

        <PhoneField
          label="Seu número de telefone"
          value={data.telefone}
          onChange={(v) => update("telefone", v)}
          error={errors.telefone}
        />
      </div>
    </div>
  );
}

/* ═══ Outlined Field — label corta a borda ═══ */
function OutlinedField({
  label,
  value,
  onChange,
  error,
  maxLength,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  maxLength?: number;
  inputMode?: "text" | "numeric" | "tel";
}) {
  const hasValue = !!value?.trim();
  const isActive = hasValue;

  return (
    <div>
      <fieldset
        className={cn(
          "relative rounded-xl border transition-colors duration-200 px-3.5",
          error
            ? "border-destructive/50 focus-within:border-destructive"
            : "border-border focus-within:border-foreground"
        )}
      >
        <legend
          className={cn(
            "transition-all duration-200 text-muted-foreground px-1",
            isActive ? "text-[11px] ml-0.5" : "text-[0px] ml-0 px-0"
          )}
        >
          {isActive ? label : ""}
        </legend>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          inputMode={inputMode}
          placeholder={label}
          className={cn(
            "w-full bg-transparent text-[15px] text-foreground outline-none",
            "placeholder:text-muted-foreground",
            isActive ? "h-10 pb-2.5" : "h-14 py-4"
          )}
        />
      </fieldset>
      {error && (
        <p className="text-[11px] text-destructive mt-1 ml-1">{error}</p>
      )}
    </div>
  );
}

/* ═══ Phone Field com seletor de código do país ═══ */
const COUNTRY_CODES = [
  { code: "+55", country: "BR", flag: "🇧🇷" },
  { code: "+1", country: "US", flag: "🇺🇸" },
  { code: "+351", country: "PT", flag: "🇵🇹" },
  { code: "+34", country: "ES", flag: "🇪🇸" },
  { code: "+44", country: "UK", flag: "🇬🇧" },
  { code: "+33", country: "FR", flag: "🇫🇷" },
  { code: "+49", country: "DE", flag: "🇩🇪" },
  { code: "+39", country: "IT", flag: "🇮🇹" },
  { code: "+54", country: "AR", flag: "🇦🇷" },
  { code: "+56", country: "CL", flag: "🇨🇱" },
  { code: "+57", country: "CO", flag: "🇨🇴" },
  { code: "+52", country: "MX", flag: "🇲🇽" },
  { code: "+595", country: "PY", flag: "🇵🇾" },
  { code: "+598", country: "UY", flag: "🇺🇾" },
];

function PhoneField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const [countryCode, setCountryCode] = useState("+55");
  const [showCodes, setShowCodes] = useState(false);
  const hasValue = !!value?.trim();
  const isActive = hasValue;

  return (
    <div className="relative">
      <fieldset
        className={cn(
          "relative rounded-xl border transition-colors duration-200 px-3.5 flex items-center",
          error
            ? "border-destructive/50 focus-within:border-destructive"
            : "border-border focus-within:border-foreground"
        )}
      >
        <legend
          className={cn(
            "transition-all duration-200 text-muted-foreground px-1",
            isActive ? "text-[11px] ml-0.5" : "text-[0px] ml-0 px-0"
          )}
        >
          {isActive ? label : ""}
        </legend>

        <button
          type="button"
          onClick={() => setShowCodes(!showCodes)}
          className={cn(
            "flex items-center gap-1 pr-3 mr-3 border-r border-border text-foreground shrink-0",
            "hover:text-foreground/80 transition-colors",
            isActive ? "pb-2.5" : "py-0"
          )}
        >
          <span className="text-[14px] font-medium">{countryCode}</span>
          <svg className={cn("w-3 h-3 text-muted-foreground transition-transform", showCodes && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="tel"
          maxLength={15}
          placeholder={isActive ? "" : label}
          className={cn(
            "flex-1 bg-transparent text-[15px] text-foreground outline-none",
            "placeholder:text-muted-foreground",
            isActive ? "h-10 pb-2.5" : "h-14 py-4"
          )}
        />
      </fieldset>

      {/* Dropdown de códigos */}
      {showCodes && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border border-border bg-card shadow-xl max-h-60 overflow-y-auto">
          {COUNTRY_CODES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => { setCountryCode(c.code); setShowCodes(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors",
                countryCode === c.code && "bg-muted/10"
              )}
            >
              <span className="text-lg">{c.flag}</span>
              <span className="text-[13px] text-foreground font-medium">{c.country}</span>
              <span className="text-[13px] text-muted-foreground ml-auto">{c.code}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="text-[11px] text-destructive mt-1 ml-1">{error}</p>
      )}
    </div>
  );
}
