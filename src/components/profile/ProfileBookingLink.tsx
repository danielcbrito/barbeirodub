import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link2, Copy, CheckCheck, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface ProfileBookingLinkProps {
  /** ID do barbeiro logado — usado para buscar tenant_id → slug */
  barbeiroId?: string;
}

/**
 * Card para copiar o link público de agendamento da barbearia.
 * Busca o slug do tenant vinculado ao barbeiro e monta a URL dinâmica.
 */
export function ProfileBookingLink({ barbeiroId }: ProfileBookingLinkProps) {
  const [copied, setCopied] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSlug();
  }, [barbeiroId]);

  const fetchSlug = async () => {
    try {
      setLoading(true);
      setSlug(null);

      let tenantId: string | null = null;

      if (barbeiroId) {
        const { data: barber, error: barberError } = await supabase
          .from("barbeiros")
          .select("tenant_id")
          .eq("id", barbeiroId)
          .maybeSingle();

        if (barberError) throw barberError;
        tenantId = barber?.tenant_id || null;
      } else {
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const { data: barber, error: barberError } = await supabase
            .from("barbeiros")
            .select("tenant_id")
            .eq("user_id", user.id)
            .not("tenant_id", "is", null)
            .maybeSingle();

          if (barberError) throw barberError;
          tenantId = barber?.tenant_id || null;
        }
      }

      if (!tenantId) return;

      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .select("slug")
        .eq("id", tenantId)
        .maybeSingle();

      if (tenantError) throw tenantError;
      setSlug(tenant?.slug || null);
    } catch (error) {
      console.error("Erro ao buscar slug:", error);
      setSlug(null);
    } finally {
      setLoading(false);
    }
  };

  const link = slug
    ? `https://dubagenda.lovable.app/${slug}`
    : null;

  const handleCopy = async () => {
    if (!link) {
      toast.error("Link indisponível. Configure o slug da barbearia primeiro.");
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copiado! Envie para seus clientes 🔗");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Erro ao copiar");
    }
  };

  if (loading) {
    return (
      <div className="mx-4">
        <div className="rounded-2xl border border-border/40 bg-muted/30 p-3.5 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
          <span className="text-[11px] text-muted-foreground">Carregando link...</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05, ease: [0.2, 0.9, 0.3, 1] }}
      className="mx-4"
    >
      <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3.5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Link2 className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-foreground">Link da Barbearia</p>
          <p className="text-[10px] text-muted-foreground truncate">{link || "Slug não configurado"}</p>
        </div>
        <button
          onClick={handleCopy}
          className={cn(
            "h-8 px-3 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all duration-150 active:scale-95",
            copied
              ? "bg-emerald-500/10 text-emerald-500"
              : "bg-primary/10 text-primary hover:bg-primary/20"
          )}
          aria-label={copied ? "Link copiado" : "Copiar link da barbearia"}
        >
          {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </motion.div>
  );
}
