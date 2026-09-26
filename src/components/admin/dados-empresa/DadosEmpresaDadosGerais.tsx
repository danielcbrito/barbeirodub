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
}

/**
  * Tela unificada: Dados da Barbearia.
  * Identificação + Contato + Endereço + Presença Online em uma única tela.
 */
export function DadosEmpresaDadosGerais({ basePath = "/admin", tenantId, unidadeId, onBack }: Props & { onBack?: () => void }) {
  const isUnitScope = !!tenantId && !!unidadeId && !isTenantRootUnit(unidadeId);
  const { data, loading, saving, hasChanges, update, saveData } = useDadosEmpresa(
    tenantId,
    isUnitScope ? "unit" : basePath.startsWith("/tenant/admin") ? "tenant" : "global",
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

  return (
    <SubPageLayout
      title="Dados da Barbearia"
      backPath={backPath}
      hasChanges={hasChanges}
      saving={saving}
      onSave={() => saveData(data)}
      onBack={onBack}
    >
      {/* ═══ IDENTIFICAÇÃO ═══ */}
      <FormSection index={0} title="Identificação">
        <CompactField label="Razão Social / Nome" value={data.nome} onChange={(v) => update("nome", v)} required />
        <CompactField label="Slogan" value={data.slogan} onChange={(v) => update("slogan", v)} placeholder="Ex: O melhor corte da cidade" hint="Aparece na página pública da barbearia" />
        <div className="grid grid-cols-2 gap-2.5">
          <CompactField label="CNPJ" value={data.cnpj} onChange={(v) => update("cnpj", v)} placeholder="00.000.000/0000-00" required />
          <CompactField label="CPF do Responsável" value={data.cpf} onChange={(v) => update("cpf", v)} placeholder="000.000.000-00" required />
        </div>
      </FormSection>

      {/* ═══ CONTATO ═══ */}
      <FormSection index={1} title="Contato">
        <CompactField label="E-mail" value={data.email} onChange={(v) => update("email", v)} type="email" required hint="Para notificações e recuperação de conta" />
        <div className="grid grid-cols-2 gap-2.5">
          <CompactField label="Telefone" value={data.telefone} onChange={(v) => update("telefone", v)} placeholder="(00) 00000-0000" required />
          <CompactField label="WhatsApp" value={data.whatsapp} onChange={(v) => update("whatsapp", v)} placeholder="(00) 00000-0000" />
        </div>
      </FormSection>

      {/* ═══ PRESENÇA ONLINE ═══ */}
      <FormSection index={2} title="Presença Online">
        <CompactField label="Website" value={data.site} onChange={(v) => update("site", v)} placeholder="https://suabarbearia.com.br" hint="Exibido na página pública" />
      </FormSection>

      {/* ═══ ENDEREÇO ═══ */}
      <FormSection index={3} title="Endereço">
        <CompactField label="Endereço completo" value={data.endereco_completo} onChange={(v) => update("endereco_completo", v)} placeholder="Rua, nº, bairro — cidade/UF" hint="Campo livre para texto completo" />
        <div className="grid grid-cols-4 gap-2.5">
          <div className="col-span-3">
            <CompactField label="Rua" value={data.rua} onChange={(v) => update("rua", v)} />
          </div>
          <CompactField label="Nº" value={data.numero} onChange={(v) => update("numero", v)} />
        </div>
        <CompactField label="Bairro" value={data.bairro} onChange={(v) => update("bairro", v)} />
        <div className="grid grid-cols-4 gap-2.5">
          <div className="col-span-3">
            <CompactField label="Cidade" value={data.cidade} onChange={(v) => update("cidade", v)} required />
          </div>
          <CompactField label="UF" value={data.estado} onChange={(v) => update("estado", v)} placeholder="UF" required />
        </div>
      </FormSection>
    </SubPageLayout>
  );
}

/* ═══════════════════════════════════════ */
/*  Seção de formulário — visual limpo    */
/* ═══════════════════════════════════════ */

function FormSection({ title, children, index }: { title: string; children: React.ReactNode; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.05 * index }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60 mb-3 px-1">
        {title}
      </p>
      <div className="space-y-3 rounded-2xl bg-card border border-border/20 p-4">
        {children}
      </div>
    </motion.div>
  );
}
