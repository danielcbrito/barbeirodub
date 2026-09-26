import { useState, useCallback, useRef, useEffect } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCepLookup } from "@/hooks/useCepLookup";
import { toast } from "sonner";

const VALID_UF = new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
]);

export interface EnderecoData {
  cep: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
}

interface Props {
  data: EnderecoData;
  onChange: (data: EnderecoData) => void;
  errors: Partial<Record<keyof EnderecoData, string>>;
}

/** Formata CEP "12345678" -> "12345-678" */
function formatCep(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * Step 3 — Endereço via CEP (ViaCEP).
 * Substitui o autocomplete anterior (Nominatim) que não funcionava no preview/produção
 * por causa de bloqueios de rede e CORS. Padrão CEP-first é o mais confiável no Brasil.
 */
export function StepEndereco({ data, onChange, errors }: Props) {
  const { fetchCep, loadingCep } = useCepLookup();
  const cepRef = useRef<HTMLInputElement>(null);
  const numeroRef = useRef<HTMLInputElement>(null);
  const [lastFetchedCep, setLastFetchedCep] = useState<string>("");

  const update = useCallback(
    (patch: Partial<EnderecoData>) => onChange({ ...data, ...patch }),
    [data, onChange]
  );

  const tryLookup = useCallback(
    async (cepValue: string) => {
      const clean = cepValue.replace(/\D/g, "");
      if (clean.length !== 8 || clean === lastFetchedCep) return;
      const res = await fetchCep(clean);
      if (res) {
        setLastFetchedCep(clean);
        onChange({
          ...data,
          cep: formatCep(clean),
          rua: res.logradouro || data.rua,
          bairro: res.bairro || data.bairro,
          cidade: res.localidade || data.cidade,
          estado: (res.uf || "").toUpperCase(),
        });
        setTimeout(() => numeroRef.current?.focus(), 120);
      }
    },
    [data, fetchCep, lastFetchedCep, onChange]
  );

  const handleCepChange = (raw: string) => {
    const formatted = formatCep(raw);
    update({ cep: formatted });
    const clean = formatted.replace(/\D/g, "");
    if (clean.length === 8) tryLookup(clean);
  };

  const handleUfChange = (raw: string) => {
    const upper = raw.toUpperCase().slice(0, 2);
    update({ estado: upper });
  };

  // Foca o CEP ao abrir
  useEffect(() => {
    if (!data.cep && !data.rua) {
      setTimeout(() => cepRef.current?.focus(), 250);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ufInvalid = data.estado.length === 2 && !VALID_UF.has(data.estado);

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-[22px] font-semibold text-foreground leading-tight">
          Onde está localizada a sua empresa?
        </h2>
        <p className="text-[13px] text-foreground/90 mt-1.5">
          Digite o CEP — preenchemos o resto pra você.
        </p>
      </div>

      {/* CEP */}
      <Field label="CEP" error={errors.cep}>
        <div className="relative">
          <input
            ref={cepRef}
            value={data.cep}
            onChange={(e) => handleCepChange(e.target.value)}
            onBlur={(e) => tryLookup(e.target.value)}
            placeholder="00000-000"
            inputMode="numeric"
            autoComplete="postal-code"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none h-8 pr-8"
          />
          {loadingCep && (
            <div className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-muted-foreground border-t-foreground rounded-full animate-spin" />
          )}
          {!loadingCep && data.cep.replace(/\D/g, "").length === 8 && data.rua && (
            <MapPin className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/60" />
          )}
        </div>
      </Field>

      {/* Rua + Número */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="Rua" error={errors.rua}>
            <input
              value={data.rua}
              onChange={(e) => update({ rua: e.target.value })}
              placeholder="Nome da rua"
              autoComplete="address-line1"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none h-8"
            />
          </Field>
        </div>
        <Field label="Nº" error={errors.numero}>
          <input
            ref={numeroRef}
            value={data.numero}
            onChange={(e) => update({ numero: e.target.value })}
            placeholder="123"
            inputMode="numeric"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none h-8"
          />
        </Field>
      </div>

      {/* Bairro */}
      <Field label="Bairro" error={errors.bairro}>
        <input
          value={data.bairro}
          onChange={(e) => update({ bairro: e.target.value })}
          placeholder="Bairro"
          autoComplete="address-level3"
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none h-8"
        />
      </Field>

      {/* Cidade + UF */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="Cidade" error={errors.cidade}>
            <input
              value={data.cidade}
              onChange={(e) => update({ cidade: e.target.value })}
              placeholder="Cidade"
              autoComplete="address-level2"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none h-8"
            />
          </Field>
        </div>
        <Field
          label="UF"
          error={errors.estado || (ufInvalid ? "UF inválida" : undefined)}
        >
          <input
            value={data.estado}
            onChange={(e) => handleUfChange(e.target.value)}
            placeholder="UF"
            autoComplete="address-level1"
            maxLength={2}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none h-8 uppercase"
          />
        </Field>
      </div>

      <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
        Não sabe seu CEP?{" "}
        <a
          href="https://buscacepinter.correios.com.br/app/endereco/index.php"
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-foreground/80"
        >
          Consultar nos Correios
        </a>
      </p>
    </div>
  );
}

/** Campo padrão com legenda flutuante. */
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <fieldset
        className={cn(
          "relative border-2 rounded-xl px-3 pt-1 pb-2 transition-colors",
          error ? "border-destructive" : "border-border"
        )}
      >
        <legend
          className={cn(
            "text-[10px] uppercase tracking-wider px-1",
            error ? "text-destructive font-semibold" : "text-muted-foreground"
          )}
        >
          {label}
        </legend>
        {children}
      </fieldset>
      {error && <p className="text-[10px] text-destructive mt-1 ml-1 font-medium">{error}</p>}
    </div>
  );
}
