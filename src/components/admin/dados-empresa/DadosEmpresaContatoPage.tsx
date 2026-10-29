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

/**
 * Sub-página: Contato da barbearia (e-mail, telefone, WhatsApp).
 * Validação de canais oficiais para lembretes e cobranças.
 */
export function DadosEmpresaContatoPage({ basePath = "/admin", tenantId, unidadeId, onBack }: Props) {
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

  const cleanTel = digits(data.telefone);
  const cleanWhats = digits(data.whatsapp);
  const hasContact = cleanTel.length >= 10 || cleanWhats.length >= 10;
  const isEmailEmpty = !data.email?.trim();

  return (
    <SubPageLayout
      title="Contato"
      subtitle="Canais oficiais de atendimento da barbearia"
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
        <CompactField
          label="E-mail da Barbearia"
          value={data.email}
          onChange={(v) => update("email", v)}
          type="email"
          placeholder="contato@barbearia.com.br"
          required
          isPending={isEmailEmpty}
          pendingMessage="E-mail necessário para emissão de cobranças e notificações"
          hint="Usado para comunicações e notificações do sistema"
        />

        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Telefone / WhatsApp (Obrigatório)
            </span>
            <span className="text-[10.5px] text-muted-foreground/50">Pelo menos um canal</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CompactField
              label="Telefone Principal"
              value={data.telefone}
              onChange={(v) => update("telefone", v)}
              placeholder="(11) 90000-0000"
              required={!hasContact}
              isPending={!hasContact && !cleanTel}
              pendingMessage="Telefone ou WhatsApp oficial é obrigatório"
            />

            <CompactField
              label="WhatsApp Oficial"
              value={data.whatsapp}
              onChange={(v) => update("whatsapp", v)}
              placeholder="(11) 90000-0000"
              required={!hasContact}
              isPending={!hasContact && !cleanWhats}
              pendingMessage="Telefone ou WhatsApp oficial é obrigatório"
            />
          </div>
        </div>
      </motion.div>
    </SubPageLayout>
  );
}
