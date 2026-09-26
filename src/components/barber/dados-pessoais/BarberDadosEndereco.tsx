import { useBarberDados } from "./useBarberDados";
import { CompactField } from "@/components/admin/dados-empresa/CompactField";
import { SubPageLayout } from "@/components/admin/dados-empresa/SubPageLayout";
import { Loader2 } from "lucide-react";

interface Props {
  barbeiroId: string;
  basePath?: string;
}

/**
 * Sub-tela: Endereço do barbeiro.
 * Design idêntico ao DadosEmpresaEndereco do admin.
 */
export function BarberDadosEndereco({ barbeiroId, basePath = "/barbeiro" }: Props) {
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
      title="Endereço"
      backPath={`${basePath}/meus-dados`}
      hasChanges={hasChanges}
      saving={saving}
      onSave={() => saveData(data)}
    >
      <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
        Seu endereço pessoal. Usado para registros internos.
      </p>

      <CompactField label="CEP" value={data.endereco_cep} onChange={(v) => update("endereco_cep", v)} placeholder="00000-000" />

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <CompactField label="Rua" value={data.endereco_rua} onChange={(v) => update("endereco_rua", v)} />
        </div>
        <CompactField label="Nº" value={data.endereco_numero} onChange={(v) => update("endereco_numero", v)} />
      </div>

      <CompactField label="Bairro" value={data.endereco_bairro} onChange={(v) => update("endereco_bairro", v)} />

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <CompactField label="Cidade" value={data.endereco_cidade} onChange={(v) => update("endereco_cidade", v)} required />
        </div>
        <CompactField label="UF" value={data.endereco_estado} onChange={(v) => update("endereco_estado", v)} placeholder="UF" required />
      </div>
    </SubPageLayout>
  );
}
