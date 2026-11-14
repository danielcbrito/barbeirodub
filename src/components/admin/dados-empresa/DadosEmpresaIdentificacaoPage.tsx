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

const maskCpf = (val: string) => {
  const d = val.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

const maskCnpj = (val: string) => {
  const d = val.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
};

/**
 * Sub-página: Identificação da barbearia (nome, slogan, CNPJ, CPF).
 * CPF do responsável é estritamente obrigatório; CNPJ é opcional.
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

  const cleanCpf = digits(data.cpf);
  const isCpfValid = cleanCpf.length === 11;
  const isNameEmpty = !data.nome?.trim();

  return (
    <SubPageLayout
      title="Identificação"
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
        className="space-y-4"
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

        <CompactField
          label="E-mail de Contato"
          value={data.email}
          onChange={(v) => update("email", v)}
          type="email"
          placeholder="contato@suabarbearia.com.br"
          required
          isPending={!data.email || !data.email.includes("@")}
          pendingMessage="E-mail obrigatório para notificações e emissão de cobranças"
          hint="E-mail oficial para recebimento de notas e avisos do sistema"
        />

        <CompactField
          label="CPF do Responsável"
          value={data.cpf}
          onChange={(v) => update("cpf", maskCpf(v))}
          placeholder="000.000.000-00"
          required
          isPending={!isCpfValid}
          pendingMessage="CPF do responsável é obrigatório (11 dígitos) para assinaturas e cobranças"
          hint="Documento do titular responsável pela conta e repasses"
        />

        <CompactField
          label="CNPJ (opcional)"
          value={data.cnpj}
          onChange={(v) => update("cnpj", maskCnpj(v))}
          placeholder="00.000.000/0000-00"
          required={false}
          hint="Opcional se possuir cadastro jurídico (CNPJ)"
        />
      </motion.div>
    </SubPageLayout>
  );
}
