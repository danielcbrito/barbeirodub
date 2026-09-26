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
 * Sub-tela: Presença online (website).
 */
export function DadosEmpresaOnline({ basePath = "/admin", tenantId, onBack }: Props) {
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
      title="Online"
      backPath={`${basePath}/dados-empresa`}
      hasChanges={hasChanges}
      saving={saving}
      onSave={() => saveData(data)}
      onBack={onBack}
    >
      <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
        Endereço do seu site na internet. Será exibido no perfil público da barbearia.
      </p>

      <CompactField label="Website" value={data.site} onChange={(v) => update("site", v)} placeholder="https://suabarbearia.com.br" />
    </SubPageLayout>
  );
}
