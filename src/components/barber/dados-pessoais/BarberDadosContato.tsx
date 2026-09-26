import { useBarberDados } from "./useBarberDados";
import { CompactField } from "@/components/admin/dados-empresa/CompactField";
import { SubPageLayout } from "@/components/admin/dados-empresa/SubPageLayout";
import { Loader2 } from "lucide-react";

interface Props {
  barbeiroId: string;
  basePath?: string;
}

/**
 * Sub-tela: Contato do barbeiro (e-mail, telefone).
 * Design idêntico ao DadosEmpresaContato do admin.
 */
export function BarberDadosContato({ barbeiroId, basePath = "/barbeiro" }: Props) {
  const { data, loading, saving, hasChanges, update, saveData } = useBarberDados(barbeiroId);

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
      backPath={`${basePath}/meus-dados`}
      hasChanges={hasChanges}
      saving={saving}
      onSave={() => saveData(data)}
    >
      <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
        Seus dados de contato. O e-mail é usado para login e notificações.
      </p>

      <CompactField label="E-mail" value={data.email} onChange={(v) => update("email", v)} type="email" required />
      <CompactField label="Telefone / WhatsApp" value={data.telefone} onChange={(v) => update("telefone", v)} placeholder="(00) 00000-0000" required />
    </SubPageLayout>
  );
}
