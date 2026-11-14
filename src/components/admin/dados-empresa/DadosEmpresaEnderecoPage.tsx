import { useState, useCallback, useRef, useEffect } from "react";
import { useDadosEmpresa } from "./useDadosEmpresa";
import { SubPageLayout } from "./SubPageLayout";
import { Loader2, MapPin, Search, X, ChevronRight, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import { buildDadosEmpresaSearch, isTenantRootUnit } from "./unitSelection";
import { cn } from "@/lib/utils";

interface Props {
  basePath?: string;
  tenantId?: string | null;
  unidadeId?: string | null;
  onBack?: () => void;
}

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

interface AddressResult {
  display: string;
  street: string;
  neighbourhood: string;
  city: string;
  state: string;
  postcode: string;
}

/**
 * Sub-página: Endereço oficial da barbearia.
 * Design 100% idêntico ao WizardStepEndereco de cadastro de barbearia:
 *   - Card de endereço confirmado com MapPin e botão de lápis para editar.
 *   - Campos fieldset nativos com legend para Número e Complemento.
 *   - Busca inteligente de endereços com Nominatim, autocomplete e geolocalização.
 */
export function DadosEmpresaEnderecoPage({ basePath = "/admin", tenantId, unidadeId, onBack }: Props) {
  const isUnitScope = !!tenantId && !!unidadeId && !isTenantRootUnit(unidadeId);
  const { data, loading, saving, hasChanges, update, saveData, setData } = useDadosEmpresa(
    tenantId,
    isUnitScope ? "unit" : tenantId ? "tenant" : "global",
    unidadeId,
  );
  const backPath = `${basePath}/dados-empresa${buildDadosEmpresaSearch(unidadeId)}`;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoContext, setGeoContext] = useState<{
    lat: number; lon: number; city: string; state: string; neighbourhood: string;
  } | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestCounterRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Inicializa o modo selecionado se houver rua carregada
  useEffect(() => {
    if (data.rua) {
      setSelected(true);
    }
  }, [data.rua]);

  const fullAddress = data.rua
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

        return {
          display: item.display_name,
          street,
          neighbourhood,
          city,
          state,
          postcode: postcode.replace(/^(\d{5})(\d{3})$/, "$1-$2"),
          _score: score,
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
    setData((prev) => ({
      ...prev,
      rua: result.street,
      bairro: result.neighbourhood,
      cidade: result.city,
      estado: sanitizeUF(result.state),
      cep: result.postcode.replace(/\D/g, "").replace(/^(\d{5})(\d{3})$/, "$1-$2"),
      numero: "",
      complemento: prev.complemento || "",
    }));
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

  const handleCancelSearch = () => {
    if (data.rua) {
      setSelected(true);
      setQuery("");
      setResults([]);
    } else {
      handleClear();
    }
  };

  useEffect(() => {
    if (!selected && !data.rua) {
      setTimeout(() => inputRef.current?.focus(), 300);
      requestLocation();
    }
  }, [selected, data.rua, requestLocation]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <SubPageLayout
      title="Endereço"
      backPath={backPath}
      hasChanges={hasChanges}
      saving={saving}
      onSave={() => saveData(data)}
      onBack={onBack}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-4"
      >
        {/* Phase: Search or Confirmed */}
        {!selected ? (
          <div className="space-y-3">
            <div>
              <p className="text-[13px] text-muted-foreground">
                Pesquise o endereço, rua ou nome do local.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  placeholder="Pesquisar endereço"
                  className="w-full h-12 pl-10 pr-10 bg-card border border-border text-sm rounded-full outline-none focus:border-foreground/40 transition-all text-foreground placeholder:text-muted-foreground"
                />
                {query && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {(query || data.rua) && (
                <button
                  type="button"
                  onClick={handleCancelSearch}
                  className="text-[13px] font-medium text-foreground shrink-0 cursor-pointer px-2 py-1 hover:opacity-80 transition-opacity"
                >
                  Cancelar
                </button>
              )}
            </div>

            {results.length > 0 && (
              <div className="mt-3 divide-y divide-border rounded-2xl border border-border/40 bg-card overflow-hidden">
                {results.map((r, i) => (
                  <button
                    key={`${r.street}-${r.city}-${i}`}
                    type="button"
                    onClick={() => handleSelect(r)}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/10 active:bg-muted/20 transition-colors cursor-pointer"
                  >
                    <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground truncate">
                        {r.street || r.neighbourhood || r.city}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
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
          <div className="space-y-4">
            {/* Endereço selecionado — card minimalista exatamente igual ao Wizard */}
            <div className="rounded-2xl border border-border/60 bg-card px-4 py-4 flex items-start gap-3 shadow-xs">
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.6} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Endereço
                </p>
                <p className="text-[14px] text-foreground leading-relaxed mt-1">
                  {fullAddress || "Endereço selecionado"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleEdit}
                className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl border border-border/60 hover:bg-muted/10 active:opacity-70 transition-all cursor-pointer"
                aria-label="Editar endereço"
              >
                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>

            {/* Número */}
            <fieldset className="relative border border-border rounded-xl px-3 pt-1 pb-2 bg-card">
              <legend className="text-[10px] text-muted-foreground uppercase tracking-wider px-1 font-medium">
                Número
              </legend>
              <input
                value={data.numero}
                onChange={(e) => update("numero", e.target.value)}
                onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 250)}
                placeholder="Insira somente o número"
                inputMode="numeric"
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none h-9"
              />
            </fieldset>

            {/* Complemento */}
            <fieldset className="relative border border-border rounded-xl px-3 pt-1 pb-2 bg-card">
              <legend className="text-[10px] text-muted-foreground uppercase tracking-wider px-1 font-medium">
                Complemento
              </legend>
              <input
                value={data.complemento || ""}
                onChange={(e) => update("complemento", e.target.value)}
                onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 250)}
                placeholder="Sala, andar..."
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none h-9"
              />
            </fieldset>

            {!data.numero?.trim() && (
              <p className="text-[11px] text-rose-500/90 flex items-center gap-1.5 px-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                Número é obrigatório para emissão de assinaturas e comprovantes fiscais
              </p>
            )}
          </div>
        )}
      </motion.div>
    </SubPageLayout>
  );
}
