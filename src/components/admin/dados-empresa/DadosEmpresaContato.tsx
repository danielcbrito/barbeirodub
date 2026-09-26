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
 * Sub-tela: Contato da empresa (e-mail, telefone, WhatsApp).
 */
export function DadosEmpresaContato({ basePath = "/admin", tenantId, onBack }: Props) {
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
      title="Contato"
      backPath={`${basePath}/dados-empresa`}
      hasChanges={hasChanges}
      saving={saving}
      onSave={() => saveData(data)}
      onBack={onBack}
    >
      <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
        Canais para seus clientes entrarem em contato. O WhatsApp é usado para notificações automáticas.
      </p>

      <CompactField label="E-mail" value={data.email} onChange={(v) => update("email", v)} type="email" required />
      <CompactField label="Telefone" value={data.telefone} onChange={(v) => update("telefone", v)} placeholder="(00) 00000-0000" required />
      <CompactField label="WhatsApp" value={data.whatsapp} onChange={(v) => update("whatsapp", v)} placeholder="(00) 00000-0000" />
    </SubPageLayout>
  );
}
