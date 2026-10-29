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

const digits = (v?: string | null) => (v ?? "").replace(/\D/g, "");

/**
 * Sub-página: Identificação da barbearia (nome, slogan, CNPJ, CPF).
 * Detecção inteligente de pendências fiscais para Pix Automático (Woovi).
 */
export function DadosEmpresaIdentificacaoPage({ basePath = "/admin", tenantId, unidadeId, onBack }: Props) {
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

  const cleanCnpj = digits(data.cnpj);
  const cleanCpf = digits(data.cpf);
  const hasDoc = cleanCnpj.length === 14 || cleanCpf.length === 11;
  const isNameEmpty = !data.nome?.trim();

  return (
    <SubPageLayout
      title="Identificação"
      subtitle="Dados cadastrais e fiscais da barbearia"
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
        className="space-y-4 rounded-2xl bg-card border border-border/40 p-4 shadow-xs"
      >
        <CompactField
          label="Nome da Barbearia"
          value={data.nome}
          onChange={(v) => update("nome", v)}
          placeholder="Ex: Barbearia Estilo Nobre"
          required
          isPending={isNameEmpty}
          pendingMessage="Nome obrigatório para emissão de assinaturas e pagamentos"
        />

        <CompactField
          label="Slogan (opcional)"
          value={data.slogan}
          onChange={(v) => update("slogan", v)}
          placeholder="Ex: Estilo e tradição desde 2018"
          hint="Aparece no perfil público e no link de agendamento"
        />

        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Documento Fiscal (Obrigatório)
            </span>
            <span className="text-[10.5px] text-muted-foreground/50">CNPJ ou CPF</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CompactField
              label="CNPJ"
              value={data.cnpj}
              onChange={(v) => update("cnpj", v)}
              placeholder="00.000.000/0000-00"
              required={!hasDoc}
              isPending={!hasDoc && !cleanCnpj}
              pendingMessage="Informe o CNPJ ou CPF do titular responsável"
            />

            <CompactField
              label="CPF do Responsável"
              value={data.cpf}
              onChange={(v) => update("cpf", v)}
              placeholder="000.000.000-00"
              required={!hasDoc}
              isPending={!hasDoc && !cleanCpf}
              pendingMessage="Informe o CPF ou CNPJ do titular responsável"
            />
          </div>
        </div>
      </motion.div>
    </SubPageLayout>
  );
}
