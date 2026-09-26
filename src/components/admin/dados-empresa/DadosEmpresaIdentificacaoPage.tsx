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
 * Sub-página: Identificação da barbearia (nome, slogan, CNPJ, CPF).
 */
export function DadosEmpresaIdentificacaoPage({ basePath = "/admin", tenantId, unidadeId, onBack }: Props) {
  const isUnitScope = !!tenantId && !!unidadeId && !isTenantRootUnit(unidadeId);
  const { data, loading, saving, hasChanges, update, saveData } = useDadosEmpresa(
    tenantId,
    isUnitScope ? "unit" : basePath.startsWith("/tenant/admin") ? "tenant" : "global",
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
      title="Identificação"
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
        <CompactField label="Razão Social / Nome" value={data.nome} onChange={(v) => update("nome", v)} required />
        <CompactField label="Slogan" value={data.slogan} onChange={(v) => update("slogan", v)} placeholder="Ex: O melhor corte da cidade" hint="Aparece na página pública da barbearia" />
        <div className="grid grid-cols-2 gap-2.5">
          <CompactField label="CNPJ" value={data.cnpj} onChange={(v) => update("cnpj", v)} placeholder="00.000.000/0000-00" required />
          <CompactField label="CPF do Responsável" value={data.cpf} onChange={(v) => update("cpf", v)} placeholder="000.000.000-00" required />
        </div>
      </motion.div>
    </SubPageLayout>
  );
}
