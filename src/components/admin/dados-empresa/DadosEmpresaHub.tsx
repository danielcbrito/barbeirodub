import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  ChevronRight,
  MapPin,
  Globe,
  User,
  Building,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildDadosEmpresaSearch } from "./unitSelection";
import { useDadosEmpresaUnits } from "./useDadosEmpresaUnits";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";
import { useBarbershopPendingFields } from "@/hooks/useBarbershopPendingFields";

interface Props {
  basePath?: string;
  tenantId?: string | null;
  selectedUnidadeId?: string | null;
  onBack?: () => void;
  isTenantAdmin?: boolean;
}

interface NavCard {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  path: string;
  pendingCount?: number;
}

/**
 * Hub de Dados Gerais — padrão 100% executivo, minimalista e sério (Apple/Linear/Raycast).
 * Integra os Dados da Barbearia (Identificação, Contato, Endereço com CEP, Online)
 * e os Meus Dados do Barbeiro / Titular, com badges numéricos de pendências em cascata.
 */
export function DadosEmpresaHub({
  basePath = "/admin",
  tenantId,
  selectedUnidadeId,
  onBack,
  isTenantAdmin = true,
}: Props) {
  const navigate = useNavigate();
  const { units, defaultUnit } = useDadosEmpresaUnits(tenantId);

  const currentUnit = useMemo(
    () => units.find((unit) => unit.id === selectedUnidadeId) ?? defaultUnit,
    [defaultUnit, selectedUnidadeId, units],
  );

  const unidadeSearch = buildDadosEmpresaSearch(currentUnit?.id ?? selectedUnidadeId ?? null);

  // Hook compartilhado de pendências cadastrais
  const { totalPendingCount, pendingByCategory, loading: loadingPending } = useBarbershopPendingFields(
    tenantId,
    currentUnit?.id
  );

  /** Cards de dados cadastrais com detecção de pendências */
  const cards: NavCard[] = [
    ...(isTenantAdmin
      ? [
          {
            id: "identificacao",
            icon: Building2,
            title: "Identificação",
            description: "Nome oficial, slogan, CNPJ, CPF e e-mail",
            path: `${basePath}/dados-empresa/identificacao${unidadeSearch}`,
            pendingCount: pendingByCategory.identificacao,
          },
          {
            id: "endereco",
            icon: MapPin,
            title: "Endereço",
            description: "CEP, rua, número, bairro, cidade e estado",
            path: `${basePath}/dados-empresa/endereco${unidadeSearch}`,
            pendingCount: pendingByCategory.endereco,
          },
          {
            id: "online",
            icon: Globe,
            title: "Presença Online",
            description: "Website e redes sociais da barbearia",
            path: `${basePath}/dados-empresa/online${unidadeSearch}`,
            pendingCount: 0,
          },
        ]
      : []),
    {
      id: "dados-pessoais",
      icon: User,
      title: "Meus Dados Pessoais",
      description: "Nome completo, CPF, data de nascimento e e-mail",
      path: basePath.startsWith("/admin") ? "/admin/meus-dados" : "/barbeiro/meus-dados",
      pendingCount: 0,
    },
  ];

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(`${basePath}/config-barbearia`, { replace: true });
    }
  };

  return (
    <div className="pb-20 min-h-app bg-background">
      {/* ── Header Padrão do Sistema ── */}
      <ScheduleHeader
        title="Dados Gerais"
        onBack={handleBack}
      />

      <div className="px-4 pt-3 w-full space-y-4">
        {/* Seletor de Unidades (se houver filiais cadastradas) */}
        {units.length > 1 && (
          <div className="flex items-center justify-between p-3 rounded-2xl bg-secondary/40 border border-border/40">
            <div className="flex items-center gap-2.5 min-w-0">
              <Building className="w-4 h-4 text-foreground/70 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
                  Unidade Selecionada
                </p>
                <p className="text-[13.5px] font-medium text-foreground truncate">
                  {currentUnit?.nome || "Unidade Principal"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate(`${basePath}/dados-empresa/trocar-unidade${unidadeSearch}`)}
              className="text-[12px] font-medium text-foreground hover:underline underline-offset-2 shrink-0 px-2.5 py-1 rounded-lg bg-background border border-border/50 active:scale-95 transition-all"
            >
              Trocar
            </button>
          </div>
        )}

        {/* ═══ LISTA DIRETA DE OPÇÕES (SEM TÍTULOS DE SEÇÃO INTERMEDIÁRIOS) ═══ */}
        <div className="divide-y divide-border/25 rounded-2xl bg-card border border-border/40 overflow-hidden shadow-xs">
          {cards.map((card) => {
            const hasPending = (card.pendingCount || 0) > 0;
            const Icon = card.icon;

            return (
              <button
                key={card.id}
                type="button"
                onClick={() => navigate(card.path)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/30 active:scale-[0.99] transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0 pr-3 flex-1">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                      hasPending
                        ? "bg-rose-500/10 text-rose-500 border border-rose-500/25"
                        : "bg-secondary text-foreground/80 border border-border/40 group-hover:text-foreground"
                    )}
                  >
                    <Icon className="w-[19px] h-[19px] stroke-[1.9]" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-semibold text-foreground leading-snug">
                        {card.title}
                      </p>
                      {hasPending && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white font-bold text-[10.5px] flex items-center justify-center leading-none shadow-xs">
                          {card.pendingCount}
                        </span>
                      )}
                    </div>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-1">
                      {card.description}
                    </p>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
