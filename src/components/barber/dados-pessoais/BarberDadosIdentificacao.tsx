import { useBarberDados } from "./useBarberDados";
import { CompactField } from "@/components/admin/dados-empresa/CompactField";
import { SubPageLayout } from "@/components/admin/dados-empresa/SubPageLayout";
import { Loader2 } from "lucide-react";

interface Props {
  barbeiroId: string;
  basePath?: string;
}

/**
 * Sub-tela: Identificação pessoal do barbeiro (nome, CPF, data de nascimento).
 * Design idêntico ao DadosEmpresaIdentificacao do admin.
 */
export function BarberDadosIdentificacao({ barbeiroId, basePath = "/barbeiro" }: Props) {
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
      title="Identificação"
      backPath={`${basePath}/meus-dados`}
      hasChanges={hasChanges}
      saving={saving}
      onSave={() => saveData(data)}
    >
      <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
        Seus dados pessoais de identificação. O CPF é necessário para configuração financeira.
      </p>

      <CompactField label="Nome Completo" value={data.nome_completo} onChange={(v) => update("nome_completo", v)} required />
      <CompactField label="CPF" value={data.cpf} onChange={(v) => update("cpf", v)} placeholder="000.000.000-00" required />
      <CompactField label="Data de Nascimento" value={data.data_nascimento} onChange={(v) => update("data_nascimento", v)} type="date" />
    </SubPageLayout>
  );
}
