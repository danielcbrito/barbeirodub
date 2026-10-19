import { useDadosEmpresa } from "./useDadosEmpresa";
import { CompactField } from "./CompactField";
import { SubPageLayout } from "./SubPageLayout";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { buildDadosEmpresaSearch, isTenantRootUnit } from "./unitSelection";

interface Props {
  basePath?: string;
  tenantId?: string | null;
  unidadeId?: string | null;
  onBack?: () => void;
}

/**
 * Sub-página: Endereço da barbearia.
 */
export function DadosEmpresaEnderecoPage({ basePath = "/admin", tenantId, unidadeId, onBack }: Props) {
  const isUnitScope = !!tenantId && !!unidadeId && !isTenantRootUnit(unidadeId);
  const { data, loading, saving, hasChanges, update, saveData } = useDadosEmpresa(
    tenantId,
    isUnitScope ? "unit" : tenantId ? "tenant" : "global",
    unidadeId,
  );
  const backPath = `${basePath}/dados-empresa${buildDadosEmpresaSearch(unidadeId)}`;

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
        transition={{ duration: 0.25 }}
        className="space-y-3 rounded-2xl bg-card border border-border/20 p-4"
      >
        <CompactField label="Endereço completo" value={data.endereco_completo} onChange={(v) => update("endereco_completo", v)} placeholder="Rua, nº, bairro — cidade/UF" hint="Campo livre para texto completo" />
        <div className="grid grid-cols-4 gap-2.5">
          <div className="col-span-3">
            <CompactField label="Rua" value={data.rua} onChange={(v) => update("rua", v)} />
          </div>
          <CompactField label="Nº" value={data.numero} onChange={(v) => update("numero", v)} />
        </div>
        <CompactField label="Bairro" value={data.bairro} onChange={(v) => update("bairro", v)} />
        <div className="grid grid-cols-4 gap-2.5">
          <div className="col-span-3">
            <CompactField label="Cidade" value={data.cidade} onChange={(v) => update("cidade", v)} required />
          </div>
          <CompactField label="UF" value={data.estado} onChange={(v) => update("estado", v)} placeholder="UF" required />
        </div>
      </motion.div>
    </SubPageLayout>
  );
}
