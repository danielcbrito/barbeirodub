import { useDadosEmpresa } from "./useDadosEmpresa";
import { CompactField } from "./CompactField";
import { SubPageLayout } from "./SubPageLayout";
import { Loader2 } from "lucide-react";

interface Props {
  basePath?: string;
  tenantId?: string | null;
  onBack?: () => void;
}

/**
 * Sub-tela: Identificação da empresa (nome, slogan, CNPJ, CPF).
 */
export function DadosEmpresaIdentificacao({ basePath = "/admin", tenantId, onBack }: Props) {
  const scope = tenantId ? "tenant" : (basePath.startsWith("/tenant/admin") ? "tenant" : "global");
  const { data, loading, saving, hasChanges, update, saveData } = useDadosEmpresa(tenantId, scope);

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
      backPath={`${basePath}/dados-empresa`}
      hasChanges={hasChanges}
      saving={saving}
      onSave={() => saveData(data)}
      onBack={onBack}
    >
      <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
        Informações de registro legal do seu estabelecimento. Esses dados são usados em documentos e notas fiscais.
      </p>

      <CompactField label="Razão Social / Nome" value={data.nome} onChange={(v) => update("nome", v)} required />
      <CompactField label="Slogan" value={data.slogan} onChange={(v) => update("slogan", v)} placeholder="Ex: O melhor corte da cidade" />
      <CompactField label="CNPJ" value={data.cnpj} onChange={(v) => update("cnpj", v)} placeholder="00.000.000/0000-00" required />
      <CompactField label="CPF do Responsável" value={data.cpf} onChange={(v) => update("cpf", v)} placeholder="000.000.000-00" required />
    </SubPageLayout>
  );
}
