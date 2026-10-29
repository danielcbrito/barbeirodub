import { useCallback } from "react";
import { useDadosEmpresa } from "./useDadosEmpresa";
import { CompactField } from "./CompactField";
import { SubPageLayout } from "./SubPageLayout";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { buildDadosEmpresaSearch, isTenantRootUnit } from "./unitSelection";
import { useCepLookup } from "@/hooks/useCepLookup";
import { toast } from "sonner";

interface Props {
  basePath?: string;
  tenantId?: string | null;
  unidadeId?: string | null;
  onBack?: () => void;
}

const digits = (v?: string | null) => (v ?? "").replace(/\D/g, "");

/**
 * Sub-página: Endereço oficial da barbearia com CEP obrigatório e busca automática ViaCEP.
 */
export function DadosEmpresaEnderecoPage({ basePath = "/admin", tenantId, unidadeId, onBack }: Props) {
  const isUnitScope = !!tenantId && !!unidadeId && !isTenantRootUnit(unidadeId);
  const { data, loading, saving, hasChanges, update, saveData } = useDadosEmpresa(
    tenantId,
    isUnitScope ? "unit" : tenantId ? "tenant" : "global",
    unidadeId,
  );
  const { fetchCep, loadingCep } = useCepLookup();
  const backPath = `${basePath}/dados-empresa${buildDadosEmpresaSearch(unidadeId)}`;

  const handleCepBlur = useCallback(async () => {
    const rawCep = digits(data.cep);
    if (!rawCep || rawCep.length !== 8) return;
    const res = await fetchCep(rawCep);
    if (res) {
      if (res.logradouro) update("rua", res.logradouro);
      if (res.bairro) update("bairro", res.bairro);
      if (res.localidade) update("cidade", res.localidade);
      if (res.uf) update("estado", res.uf);
      toast.success("Endereço preenchido pelo CEP");
    }
  }, [data.cep, fetchCep, update]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  const cleanCep = digits(data.cep);
  const hasCep = cleanCep.length === 8;
  const isRuaEmpty = !data.rua?.trim();
  const isNumeroEmpty = !data.numero?.trim();
  const isBairroEmpty = !data.bairro?.trim();
  const isCidadeEmpty = !data.cidade?.trim();
  const isEstadoEmpty = !data.estado?.trim();

  return (
    <SubPageLayout
      title="Endereço"
      subtitle="Localização oficial da barbearia ou filial"
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
        <div onBlur={handleCepBlur}>
          <CompactField
            label="CEP (Obrigatório)"
            value={data.cep}
            onChange={(v) => update("cep", v)}
            placeholder="00000-000"
            required
            loading={loadingCep}
            isPending={!hasCep}
            pendingMessage="CEP é obrigatório para emissão de assinaturas e pagamentos"
            hint="Digite o CEP para preencher rua, bairro e cidade automaticamente"
          />
        </div>

        <div className="grid grid-cols-4 gap-2.5">
          <div className="col-span-3">
            <CompactField
              label="Rua / Logradouro"
              value={data.rua}
              onChange={(v) => update("rua", v)}
              placeholder="Ex: Rua Ferrador"
              required
              isPending={isRuaEmpty}
              pendingMessage="Rua é obrigatória para ativação do Pix Automático"
            />
          </div>
          <div className="col-span-1">
            <CompactField
              label="Nº"
              value={data.numero}
              onChange={(v) => update("numero", v)}
              placeholder="108"
              required
              isPending={isNumeroEmpty}
              pendingMessage="Obrigatório"
            />
          </div>
        </div>

        <CompactField
          label="Bairro"
          value={data.bairro}
          onChange={(v) => update("bairro", v)}
          placeholder="Ex: Cidade Ipava"
          required
          isPending={isBairroEmpty}
          pendingMessage="Bairro é obrigatório"
        />

        <div className="grid grid-cols-4 gap-2.5">
          <div className="col-span-3">
            <CompactField
              label="Cidade"
              value={data.cidade}
              onChange={(v) => update("cidade", v)}
              placeholder="Ex: São Paulo"
              required
              isPending={isCidadeEmpty}
              pendingMessage="Cidade é obrigatória para cadastro bancário"
            />
          </div>
          <div className="col-span-1">
            <CompactField
              label="UF"
              value={data.estado}
              onChange={(v) => update("estado", v.toUpperCase().slice(0, 2))}
              placeholder="SP"
              required
              isPending={isEstadoEmpty}
              pendingMessage="UF"
            />
          </div>
        </div>
      </motion.div>
    </SubPageLayout>
  );
}
