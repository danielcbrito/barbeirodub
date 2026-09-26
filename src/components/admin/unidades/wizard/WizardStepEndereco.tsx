import { useState, useCallback, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Search, X, ChevronRight, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

const VALID_UF = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function mapStateToCode(state: string): string {
  const map: Record<string, string> = {
    acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE",
    "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA",
    "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA",
    paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
    "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
    "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
  };
  return map[normalizeText(state)] || "";
}

function sanitizeUF(state: string): string {
  const raw = (state || "").trim();
  if (!raw) return "";
  if (raw.length === 2) {
    const upper = raw.toUpperCase();
    return VALID_UF.has(upper) ? upper : "";
  }
  return mapStateToCode(raw);
}

export interface UnidadeEndereco {
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
}

interface AddressResult {
  display: string;
  street: string;
  neighbourhood: string;
  city: string;
  state: string;
  postcode: string;
}

interface WizardStepEnderecoProps {
  data: UnidadeEndereco;
  onChange: (data: UnidadeEndereco) => void;
  viewMode?: boolean;
}

/**
 * Step 2 — Endereço com busca estilo Google Places via Nominatim.
 * Design idêntico ao StepEndereco do onboarding do barbeiro.
 */
export function WizardStepEndereco({ data, onChange, viewMode = false }: WizardStepEnderecoProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(!!data.rua);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoContext, setGeoContext] = useState<{
    lat: number; lon: number; city: string; state: string; neighbourhood: string;
  } | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestCounterRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const fullAddress = selected && data.rua
    ? `${data.rua}${data.bairro ? ` - ${data.bairro}` : ""}, ${data.cidade} - ${data.estado}${data.cep ? `, ${data.cep}` : ""}`
    : "";

  const parseResults = useCallback((items: any[], originalQuery: string): AddressResult[] => {
    const normalizedQuery = normalizeText(originalQuery);
    return items
      .filter((item: any) => {
        const addr = item.address;
        return addr && (addr.road || addr.pedestrian || addr.suburb || addr.neighbourhood || addr.city || addr.town);
      })
      .map((item: any) => {
        const addr = item.address || {};
        const street = addr.road || addr.pedestrian || addr.hamlet || "";
        const neighbourhood = addr.suburb || addr.neighbourhood || addr.village || addr.city_district || "";
        const city = addr.city || addr.town || addr.municipality || addr.county || "";
        const state = sanitizeUF(addr.state_code || addr.state || "");
        const postcode = (addr.postcode || "").replace(/\D/g, "");

        let score = 0;
        const ns = normalizeText(street);
        const nn = normalizeText(neighbourhood);
        const nc = normalizeText(city);
        if (ns.startsWith(normalizedQuery)) score += 6;
        else if (ns.includes(normalizedQuery)) score += 3;
        if (nn.startsWith(normalizedQuery)) score += 2;
        if (geoContext) {
          if (normalizeText(geoContext.city) === nc) score += 4;
          if (normalizeText(geoContext.neighbourhood) === nn) score += 3;
          if (geoContext.state === state) score += 2;
        }
        if (postcode.length === 8) score += 1;

        return { display: item.display_name, street, neighbourhood, city, state,
          postcode: postcode.replace(/^(\d{5})(\d{3})$/, "$1-$2"), _score: score,
        } as AddressResult & { _score: number };
      })
      .filter((r) => r.street && r.city && r.state)
      .sort((a, b) => (b as any)._score - (a as any)._score)
      .filter((r, i, arr) => arr.findIndex(a => a.street === r.street && a.city === r.city && a.neighbourhood === r.neighbourhood) === i)
      .slice(0, 8)
      .map(({ _score, ...rest }) => rest as AddressResult);
  }, [geoContext]);

  const requestLocation = useCallback(() => {
    if (!("geolocation" in navigator)) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&addressdetails=1&zoom=18`
          );
          const json = await res.json();
          const addr = json?.address || {};
          setGeoContext({
            lat: coords.latitude, lon: coords.longitude,
            city: addr.city || addr.town || addr.municipality || "",
            state: sanitizeUF(addr.state_code || addr.state || ""),
            neighbourhood: addr.suburb || addr.neighbourhood || addr.city_district || "",
          });
        } catch { /* silencioso */ }
        finally { setGeoLoading(false); }
      },
      () => setGeoLoading(false),
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 120000 }
    );
  }, []);

  const searchAddress = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) { setResults([]); return; }
    const requestId = ++requestCounterRef.current;
    setSearching(true);
    try {
      const buildUrl = (sq: string, geo: boolean) => {
        const p = new URLSearchParams({
          q: sq, countrycodes: "br", format: "json", addressdetails: "1", limit: "10", dedupe: "1",
        });
        if (geo && geoContext) {
          const d = 0.12;
          p.set("viewbox", `${geoContext.lon - d},${geoContext.lat + d},${geoContext.lon + d},${geoContext.lat - d}`);
        }
        return `https://nominatim.openstreetmap.org/search?${p.toString()}`;
      };
      const ctx = [trimmed, geoContext?.neighbourhood, geoContext?.city, geoContext?.state, "Brasil"].filter(Boolean).join(", ");
      const r1 = await fetch(buildUrl(ctx, !!geoContext));
      let combined = await r1.json();
      if (!Array.isArray(combined)) combined = [];
      if (combined.length < 5) {
        const r2 = await fetch(buildUrl(`${trimmed}, Brasil`, false));
        const j2 = await r2.json();
        combined = [...combined, ...(Array.isArray(j2) ? j2 : [])];
      }
      if (requestId !== requestCounterRef.current) return;
      setResults(parseResults(combined, trimmed));
    } catch {
      if (requestId === requestCounterRef.current) setResults([]);
    } finally {
      if (requestId === requestCounterRef.current) setSearching(false);
    }
  }, [geoContext, parseResults]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchAddress(value), 220);
  };

  const handleSelect = (result: AddressResult) => {
    onChange({
      ...data,
      rua: result.street,
      bairro: result.neighbourhood,
      cidade: result.city,
      estado: sanitizeUF(result.state),
      cep: result.postcode.replace(/\D/g, "").replace(/^(\d{5})(\d{3})$/, "$1-$2"),
      numero: "",
      complemento: data.complemento,
    });
    setSelected(true);
    setQuery("");
    setResults([]);
  };

  const handleEdit = () => {
    setSelected(false);
    setQuery("");
    setResults([]);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (!selected) {
      setTimeout(() => inputRef.current?.focus(), 300);
      requestLocation();
    }
  }, [selected, requestLocation]);

  useEffect(() => { setSelected(!!data.rua); }, [data.rua]);
  useEffect(() => { return () => { if (debounceRef.current) clearTimeout(debounceRef.current); }; }, []);

  return (
    <div className="space-y-6">
      {/* Title — hidden in viewMode */}
      {!viewMode && (
        <div>
          <h2 className="text-[22px] font-semibold text-foreground leading-tight">
            Onde está localizada a unidade?
          </h2>
          <p className="text-[13px] text-foreground/90 mt-1.5">
            {selected
              ? "Confirme o número do estabelecimento."
              : "Pesquise o endereço ou nome do local."}
          </p>
        </div>
      )}

      {/* Phase: Search or Confirmed */}
      {!selected ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Pesquisar endereço"
                className="h-12 pl-10 pr-10 bg-card border border-border text-sm rounded-full"
              />
              {query && (
                <button
                  onClick={handleClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {query && (
              <button onClick={handleClear} className="text-[13px] font-medium text-foreground shrink-0">
                Cancelar
              </button>
            )}
          </div>

          {results.length > 0 && (
            <div className="mt-3 divide-y divide-border">
              {results.map((r, i) => (
                <button
                  key={`${r.street}-${r.city}-${i}`}
                  onClick={() => handleSelect(r)}
                  className="w-full flex items-center gap-3 py-4 text-left hover:bg-muted/5 active:bg-muted/10 transition-colors"
                >
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">
                      {r.street || r.neighbourhood || r.city}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[r.neighbourhood, r.city, r.state, r.postcode].filter(Boolean).join(" • ")}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}

          {searching && query.trim().length >= 2 && (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-muted-foreground border-t-foreground rounded-full animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <div className={cn("space-y-4", viewMode && "pt-2")}>
          {/* Endereço selecionado — card minimalista */}
          <div className="rounded-2xl border border-border/60 bg-card px-4 py-4 flex items-start gap-3">
            <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.6} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Endereço</p>
              <p className="text-[14px] text-foreground leading-relaxed mt-1">
                {fullAddress || "Endereço selecionado"}
              </p>
            </div>
            <button
              onClick={handleEdit}
              className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl border border-border/60 active:opacity-70 transition-opacity"
              aria-label="Editar endereço"
            >
              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>

          {/* Número */}
          <fieldset className="relative border border-border rounded-xl px-3 pt-1 pb-2">
            <legend className="text-[10px] text-muted-foreground uppercase tracking-wider px-1">
              Número
            </legend>
            <input
              value={data.numero}
              onChange={(e) => onChange({ ...data, numero: e.target.value })}
              onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 250)}
              placeholder="Insira somente o número"
              inputMode="numeric"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none h-9"
            />
          </fieldset>

          {/* Complemento */}
          <fieldset className="relative border border-border rounded-xl px-3 pt-1 pb-2">
            <legend className="text-[10px] text-muted-foreground uppercase tracking-wider px-1">
              Complemento
            </legend>
            <input
              value={data.complemento}
              onChange={(e) => onChange({ ...data, complemento: e.target.value })}
              onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 250)}
              placeholder="Sala, andar..."
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none h-9"
            />
          </fieldset>

          {/* Espaço de conforto para o teclado */}
          <div className="h-24" aria-hidden />
        </div>
      )}
    </div>
  );
}
