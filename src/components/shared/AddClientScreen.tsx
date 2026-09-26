import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UserPlus, Loader2, User, Phone, Mail } from "lucide-react";
import { formatPhone } from "@/lib/validators";
import { motion } from "framer-motion";

/**
 * Tela inteira para adicionar um novo cliente.
 * Segue o design system do app: campos outlined com label cortando a borda (fieldset/legend).
 */
interface AddClientScreenProps {
  onBack: () => void;
  onClientAdded: () => void;
  tenantId?: string;
}

export function AddClientScreen({ onBack, onClientAdded, tenantId }: AddClientScreenProps) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-clients", {
        body: {
          action: "create",
          nome: nome.trim(),
          telefone: telefone.replace(/\D/g, "") || null,
          email: email.trim() || null,
          tenantId: tenantId || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Cliente adicionado com sucesso!");
      onClientAdded();
    } catch (error: any) {
      console.error("Error adding client:", error);
      toast.error(error?.message || "Erro ao adicionar cliente");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="pb-32 -mx-3 -mt-3"
    >
      {/* Header fixo */}
      <div className="sticky top-0 z-30 bg-background border-b border-border/30">
        <div className="flex items-center gap-2.5 px-4 h-14">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all"
            aria-label="Voltar"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-foreground"
            >
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10a4 4 0 0 1 4 4v1" />
            </svg>
          </button>
          <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1">
            Novo Cliente
          </h1>
        </div>
      </div>

      <div className="px-5 pt-6 space-y-6">
        <p className="text-[13px] text-muted-foreground">
          Preencha as informações do seu cliente.
        </p>

        {/* Campos no estilo outlined (fieldset/legend) */}
        <div className="space-y-5">
          {/* Nome */}
          <fieldset className="relative border border-border/40 rounded-xl px-4 pt-1 pb-3 focus-within:border-primary/50 transition-colors">
            <legend className="px-1.5 text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
              Nome completo *
            </legend>
            <div className="flex items-center gap-3 mt-1">
              <User className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: João Silva"
                className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
                autoFocus
              />
            </div>
          </fieldset>

          {/* Telefone */}
          <fieldset className="relative border border-border/40 rounded-xl px-4 pt-1 pb-3 focus-within:border-primary/50 transition-colors">
            <legend className="px-1.5 text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
              Telefone
            </legend>
            <div className="flex items-center gap-3 mt-1">
              <Phone className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
              <input
                type="tel"
                value={telefone}
                onChange={(e) => setTelefone(formatPhone(e.target.value))}
                placeholder="(11) 99999-9999"
                maxLength={15}
                className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
              />
            </div>
          </fieldset>

          {/* E-mail */}
          <fieldset className="relative border border-border/40 rounded-xl px-4 pt-1 pb-3 focus-within:border-primary/50 transition-colors">
            <legend className="px-1.5 text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
              E-mail
            </legend>
            <div className="flex items-center gap-3 mt-1">
              <Mail className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
              />
            </div>
          </fieldset>
        </div>
      </div>

      {/* Botão fixo no rodapé */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border/30 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <button
          onClick={handleSave}
          disabled={saving || !nome.trim()}
          className="w-full h-12 rounded-xl text-[15px] font-semibold shadow-lg bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:pointer-events-none transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Salvando...
            </>
          ) : (
            "Adicionar Cliente"
          )}
        </button>
      </div>
    </motion.div>
  );
}
