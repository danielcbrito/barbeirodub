import { useCallback } from "react";
import { useDadosEmpresa } from "./useDadosEmpresa";
import { CompactField } from "./CompactField";
import { SubPageLayout } from "./SubPageLayout";
import { Loader2 } from "lucide-react";
import { useCepLookup } from "@/hooks/useCepLookup";
import { toast } from "sonner";

interface Props {
  basePath?: string;
  tenantId?: string | null;
  onBack?: () => void;
}

/**
 * Sub-tela: Endereço completo da empresa com busca automática por CEP.
 */
export function DadosEmpresaEndereco({ basePath = "/admin", tenantId, onBack }: Props) {
  const scope = tenantId ? "tenant" : (basePath.startsWith("/tenant/admin") ? "tenant" : "global");
  const { data, loading, saving, hasChanges, update, saveData } = useDadosEmpresa(tenantId, scope);
  const { fetchCep, loadingCep } = useCepLookup();

  const handleCepBlur = useCallback(async () => {
    const cep = data.endereco_completo;
    if (!cep || cep.replace(/\D/g, "").length !== 8) return;
    const result = await fetchCep(cep);
    if (result) {
      update("rua", result.logradouro || "");
      update("bairro", result.bairro || "");
      update("cidade", result.localidade || "");
      update("estado", result.uf || "");
      toast.success("Endereço preenchido automaticamente");
    }
  }, [data.endereco_completo, fetchCep, update]);

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
      backPath={`${basePath}/dados-empresa`}
      hasChanges={hasChanges}
      saving={saving}
      onSave={() => saveData(data)}
      onBack={onBack}
    >
      <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
        Digite o CEP para preencher automaticamente o endereço.
      </p>

      <div onBlur={handleCepBlur}>
        <CompactField
          label="CEP"
          value={data.endereco_completo}
          onChange={(v) => update("endereco_completo", v)}
          placeholder="00000-000"
          loading={loadingCep}
          hint="Digite o CEP e saia do campo para buscar"
        />
      </div>
      
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <CompactField label="Rua" value={data.rua} onChange={(v) => update("rua", v)} />
        </div>
        <CompactField label="Nº" value={data.numero} onChange={(v) => update("numero", v)} />
      </div>

      <CompactField label="Bairro" value={data.bairro} onChange={(v) => update("bairro", v)} />
      
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <CompactField label="Cidade" value={data.cidade} onChange={(v) => update("cidade", v)} required />
        </div>
        <CompactField label="UF" value={data.estado} onChange={(v) => update("estado", v)} placeholder="UF" required />
      </div>
    </SubPageLayout>
  );
}
