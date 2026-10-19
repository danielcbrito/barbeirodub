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
 * Sub-página: Contato da barbearia (e-mail, telefone, WhatsApp).
 */
export function DadosEmpresaContatoPage({ basePath = "/admin", tenantId, unidadeId, onBack }: Props) {
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
      title="Contato"
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
        <CompactField label="E-mail" value={data.email} onChange={(v) => update("email", v)} type="email" required hint="Para notificações e recuperação de conta" />
        <div className="grid grid-cols-2 gap-2.5">
          <CompactField label="Telefone" value={data.telefone} onChange={(v) => update("telefone", v)} placeholder="(00) 00000-0000" required />
          <CompactField label="WhatsApp" value={data.whatsapp} onChange={(v) => update("whatsapp", v)} placeholder="(00) 00000-0000" />
        </div>
      </motion.div>
    </SubPageLayout>
  );
}
