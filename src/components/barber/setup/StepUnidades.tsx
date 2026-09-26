import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Plus, Trash2, MapPin, Store } from "lucide-react";

export interface UnidadeOnboarding {
  nome: string;
  cep: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
}

interface StepUnidadesProps {
  /** Nome da barbearia (sede) */
  nomeSede: string;
  unidades: UnidadeOnboarding[];
  onChange: (unidades: UnidadeOnboarding[]) => void;
}

const EMPTY_UNIDADE: UnidadeOnboarding = {
  nome: "",
  cep: "",
  rua: "",
  numero: "",
  bairro: "",
  cidade: "",
  estado: "",
};

/**
 * Step do onboarding para cadastrar filiais adicionais.
 * A sede já é criada automaticamente com os dados do endereço principal.
 */
export function StepUnidades({ nomeSede, unidades, onChange }: StepUnidadesProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    unidades.length > 0 ? 0 : null
  );

  const addUnidade = () => {
    const newList = [...unidades, { ...EMPTY_UNIDADE }];
    onChange(newList);
    setExpandedIndex(newList.length - 1);
  };

  const removeUnidade = (index: number) => {
    const newList = unidades.filter((_, i) => i !== index);
    onChange(newList);
    if (expandedIndex === index) setExpandedIndex(null);
    else if (expandedIndex !== null && expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1);
    }
  };

  const updateUnidade = (index: number, field: keyof UnidadeOnboarding, value: string) => {
    const newList = [...unidades];
    newList[index] = { ...newList[index], [field]: value };
    onChange(newList);
  };

  return (
    <div className="space-y-7">
      {/* Título */}
      <div>
        <h2 className="text-[22px] font-bold text-foreground leading-tight tracking-tight">
          Unidades da barbearia
        </h2>
        <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
          Sua sede já será criada automaticamente. Adicione filiais extras se tiver mais de uma localização.
        </p>
      </div>

      {/* Sede (read-only card) */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Store className="h-4.5 w-4.5 text-primary" strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-foreground truncate">
              {nomeSede || "Sede Principal"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Matriz — criada com seus dados atuais
            </p>
          </div>
        </div>
      </div>

      {/* Filiais adicionais */}
      <AnimatePresence>
        {unidades.map((unidade, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="rounded-2xl border border-border bg-card overflow-hidden"
          >
            {/* Header da filial — clicável para expandir */}
            <button
              onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                  <MapPin className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">
                    {unidade.nome || `Filial ${index + 1}`}
                  </p>
                  {unidade.cidade && (
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[unidade.bairro, unidade.cidade, unidade.estado].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); removeUnidade(index); }}
                className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-destructive/10 transition-colors flex-shrink-0"
                aria-label="Remover filial"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" strokeWidth={1.5} />
              </button>
            </button>

            {/* Formulário expandido */}
            <AnimatePresence>
              {expandedIndex === index && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border/50">
                    <OnboardingField
                      label="Nome da filial"
                      value={unidade.nome}
                      onChange={(v) => updateUnidade(index, "nome", v)}
                      placeholder="Ex: Filial Centro"
                    />
                    <div className="grid grid-cols-3 gap-2.5">
                      <OnboardingField
                        label="CEP"
                        value={unidade.cep}
                        onChange={(v) => updateUnidade(index, "cep", v)}
                        placeholder="00000-000"
                        inputMode="numeric"
                      />
                      <div className="col-span-2">
                        <OnboardingField
                          label="Rua"
                          value={unidade.rua}
                          onChange={(v) => updateUnidade(index, "rua", v)}
                          placeholder="Rua..."
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      <OnboardingField
                        label="Nº"
                        value={unidade.numero}
                        onChange={(v) => updateUnidade(index, "numero", v)}
                        placeholder="123"
                      />
                      <OnboardingField
                        label="Bairro"
                        value={unidade.bairro}
                        onChange={(v) => updateUnidade(index, "bairro", v)}
                        placeholder="Bairro"
                      />
                      <OnboardingField
                        label="Cidade"
                        value={unidade.cidade}
                        onChange={(v) => updateUnidade(index, "cidade", v)}
                        placeholder="Cidade"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      <OnboardingField
                        label="Estado"
                        value={unidade.estado}
                        onChange={(v) => updateUnidade(index, "estado", v.toUpperCase().slice(0, 2))}
                        placeholder="SP"
                        maxLength={2}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Botão adicionar filial */}
      <button
        onClick={addUnidade}
        className={cn(
          "w-full h-12 rounded-xl border-2 border-dashed border-border",
          "flex items-center justify-center gap-2",
          "text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-secondary/10",
          "transition-all active:scale-[0.98]"
        )}
      >
        <Plus className="h-4 w-4" strokeWidth={1.5} />
        <span className="text-[13px] font-medium">Adicionar filial</span>
      </button>

      {/* Dica */}
      <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
        Você pode pular esta etapa e adicionar filiais depois nas configurações.
      </p>
    </div>
  );
}

/* ─── Campo compacto ─── */
function OnboardingField({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "tel";
  maxLength?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        className={cn(
          "w-full h-10 px-3 rounded-xl border border-border bg-background",
          "text-[13px] text-foreground placeholder:text-muted-foreground/60",
          "outline-none focus:border-foreground/40 transition-colors"
        )}
      />
    </div>
  );
}
