import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/validators";
import { supabase } from "@/integrations/supabase/client";
import { Check } from "lucide-react";

export interface UnidadeDados {
  nome: string;
  slogan: string;
  email: string;
  telefone: string;
  whatsapp: string;
  site: string;
}

interface WizardStepDadosProps {
  data: UnidadeDados;
  onChange: (data: UnidadeDados) => void;
  tenantId: string | null;
  viewMode?: boolean;
}

/**
 * Step 1 — Dados da unidade.
 * Outlined fields + card "usar mesmo WhatsApp da barbearia".
 */
export function WizardStepDados({ data, onChange, tenantId, viewMode = false }: WizardStepDadosProps) {
  const [mainWhatsapp, setMainWhatsapp] = useState<string | null>(null);
  const [mainEmail, setMainEmail] = useState<string | null>(null);
  const [useMainNumber, setUseMainNumber] = useState(false);
  const [useMainEmail, setUseMainEmail] = useState(false);

  /* Buscar WhatsApp/e-mail da barbearia do tenant atual */
  useEffect(() => {
    (async () => {
      if (!tenantId) return;

      // Prioridade 1: dados do tenant na tabela tenants
      const { data: tenant } = await supabase
        .from("tenants")
        .select("whatsapp, email, telefone")
        .eq("id", tenantId)
        .maybeSingle();

      let wpp = tenant?.whatsapp || tenant?.telefone || null;
      let em = tenant?.email || null;

      // Prioridade 2: informacoes_empresa filtrado pelo tenant_id
      if (!wpp || !em) {
        const { data: rows } = await supabase
          .from("informacoes_empresa")
          .select("chave, valor")
          .eq("tenant_id", tenantId)
          .eq("categoria", "contato")
          .in("chave", ["whatsapp", "email"]);

        if (rows) {
          if (!wpp) {
            const wppRow = rows.find((r) => r.chave === "whatsapp");
            if (wppRow?.valor) wpp = wppRow.valor;
          }
          if (!em) {
            const emRow = rows.find((r) => r.chave === "email");
            if (emRow?.valor) em = emRow.valor;
          }
        }
      }

      if (wpp) setMainWhatsapp(wpp);
      if (em) setMainEmail(em);
    })();
  }, [tenantId]);

  const update = (field: keyof UnidadeDados, value: string) => {
    let formatted = value;
    if (field === "whatsapp" || field === "telefone") formatted = formatPhone(value);
    onChange({ ...data, [field]: formatted });
  };

  const toggleUseMainEmail = () => {
    if (!mainEmail) return;
    const next = !useMainEmail;
    setUseMainEmail(next);
    onChange({ ...data, email: next ? mainEmail : "" });
  };

  const toggleUseMainNumber = () => {
    if (!mainWhatsapp) return;
    const next = !useMainNumber;
    setUseMainNumber(next);
    onChange({ ...data, whatsapp: next ? mainWhatsapp : "", telefone: next ? mainWhatsapp : "" });
  };

  return (
    <div className="space-y-8">
      {!viewMode && (
        <div>
          <h2 className="text-[26px] font-bold text-foreground leading-tight tracking-tight">
            Dados da unidade
          </h2>
          <p className="text-[14px] text-foreground/90 mt-1.5">
            Preencha as informações básicas desta filial.
          </p>
        </div>
      )}

      <div className="space-y-5">
        <OutlinedField
          label="Nome da unidade *"
          value={data.nome}
          onChange={(v) => update("nome", v)}
        />

        <OutlinedField
          label="E-mail"
          value={data.email}
          onChange={(v) => update("email", v)}
          disabled={useMainEmail}
        />

        {/* Mini toggle: usar mesmo e-mail da barbearia */}
        {mainEmail && (
          <button
            type="button"
            onClick={toggleUseMainEmail}
            className="flex items-center gap-2 -mt-2"
          >
            <div
              className={cn(
                "w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-all duration-150",
                useMainEmail
                  ? "border-emerald-500 bg-emerald-500"
                  : "border-muted-foreground/40 bg-transparent"
              )}
            >
              {useMainEmail && <Check className="w-2.5 h-2.5 text-foreground" strokeWidth={3} />}
            </div>
            <span className="text-[11px] text-muted-foreground">
              Usar mesmo e-mail da barbearia
            </span>
          </button>
        )}

        {/* WhatsApp */}
        <PhoneField
          label="WhatsApp"
          value={data.whatsapp}
          onChange={(v) => update("whatsapp", v)}
          disabled={useMainNumber}
        />

        {/* Mini toggle: usar mesmo número da barbearia */}
        {mainWhatsapp && (
          <button
            type="button"
            onClick={toggleUseMainNumber}
            className="flex items-center gap-2 -mt-2"
          >
            <div
              className={cn(
                "w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-all duration-150",
                useMainNumber
                  ? "border-emerald-500 bg-emerald-500"
                  : "border-muted-foreground/40 bg-transparent"
              )}
            >
              {useMainNumber && <Check className="w-2.5 h-2.5 text-foreground" strokeWidth={3} />}
            </div>
            <span className="text-[11px] text-muted-foreground">
              Usar mesmo número da barbearia
            </span>
          </button>
        )}

        <OutlinedField
          label="Site"
          value={data.site}
          onChange={(v) => update("site", v)}
        />

        {/* Espaço de conforto para o teclado */}
        <div className="h-24" aria-hidden />
      </div>
    </div>
  );
}

/* ═══ Outlined Field — label corta a borda ═══ */
function OutlinedField({
  label,
  value,
  onChange,
  maxLength,
  inputMode,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  inputMode?: "text" | "numeric" | "tel";
  disabled?: boolean;
}) {
  const hasValue = !!value?.trim();
  const isActive = hasValue;

  return (
    <div>
      <fieldset
        className={cn(
          "relative rounded-xl border transition-colors duration-200 px-3.5",
          "border-border focus-within:border-foreground"
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
          onChange={(e) => !disabled && onChange(e.target.value)}
          onFocus={(e) => { const t = e.target; setTimeout(() => t.scrollIntoView({ block: "center", behavior: "smooth" }), 250); }}
          readOnly={disabled}
          maxLength={maxLength}
          inputMode={inputMode}
          placeholder={label}
          className={cn(
            "w-full bg-transparent text-[15px] outline-none",
            "placeholder:text-muted-foreground",
            disabled ? "text-muted-foreground" : "text-foreground",
            isActive ? "h-10 pb-2.5" : "h-14 py-4"
          )}
        />
      </fieldset>
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
];

function PhoneField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
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
          "border-border focus-within:border-foreground"
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
          onChange={(e) => !disabled && onChange(e.target.value)}
          onFocus={(e) => { const t = e.target; setTimeout(() => t.scrollIntoView({ block: "center", behavior: "smooth" }), 250); }}
          readOnly={disabled}
          inputMode="tel"
          maxLength={15}
          placeholder={isActive ? "" : label}
          className={cn(
            "flex-1 bg-transparent text-[15px] outline-none",
            "placeholder:text-muted-foreground",
            disabled ? "text-muted-foreground" : "text-foreground",
            isActive ? "h-10 pb-2.5" : "h-14 py-4"
          )}
        />
      </fieldset>

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
    </div>
  );
}
