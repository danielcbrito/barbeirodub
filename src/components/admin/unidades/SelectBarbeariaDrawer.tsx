import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Store, ChevronRight, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Unidade } from "./AdminUnidades";
import { UnidadeWizardSheet } from "./wizard/UnidadeWizardSheet";

interface SelectBarbeariaDrawerProps {
  open: boolean;
  onClose: () => void;
  tenantId?: string | null;
  activeUnitId?: string | null;
  onSelectUnit: (unit: Unidade) => void;
  title?: string;
  subtitle?: string;
}

const DEFAULT_COMPANY_NAME = "Barbearia DUB";
const DEFAULT_COMPANY_LOGO = "https://djtpzvujzmrrslirzwun.supabase.co/storage/v1/object/public/logos/global/logo-global-1772648853243.png";

export function SelectBarbeariaDrawer({
  open,
  onClose,
  tenantId,
  activeUnitId,
  onSelectUnit,
  title = "Configurar Barbearia",
  subtitle = "Selecione a barbearia que deseja configurar",
}: SelectBarbeariaDrawerProps) {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const loadUnidades = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("tenant_unidades")
        .select("id, tenant_id, nome, slogan, logo_url, is_sede, ativo, rua, numero, complemento, bairro, cidade, estado, telefone, whatsapp, cep, cnpj, cpf, email, site, slug, created_at")
        .eq("ativo", true);

      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query
        .order("is_sede", { ascending: false })
        .order("created_at", { ascending: true });

      if (!error && data && data.length > 0) {
        setUnidades(data as Unidade[]);
      } else {
        // Fallback para Barbearia DUB principal
        const fallbackUnit: Unidade = {
          id: tenantId || "3bc7d50a-07a6-4ee5-aab9-8dc687011385",
          tenant_id: tenantId || "73d61f2f-b369-41f3-8915-8e6de52d6378",
          nome: DEFAULT_COMPANY_NAME,
          slogan: "Transformando seu visual desde 2015",
          logo_url: DEFAULT_COMPANY_LOGO,
          is_sede: true,
          ativo: true,
          bairro: "Cidade Ipava",
          cidade: "São Paulo",
          estado: "SP",
          rua: "Rua Ferrador",
          numero: "108",
          complemento: null,
          telefone: "(11) 95226-3002",
          whatsapp: "(11) 95226-3002",
          cep: "04950-040",
          cnpj: "48737284000120",
          cpf: "36595601893",
          email: "barbeariasdub@gmail.com",
          site: "https://barbeariadub.com.br/",
          slug: "barbearia-dub",
          created_at: new Date().toISOString(),
        };
        setUnidades([fallbackUnit]);
      }
    } catch (err) {
      console.error("Erro ao carregar unidades:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadUnidades();
    }
  }, [open, tenantId]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={onClose} />
            <motion.div
              initial={{ y: "100%", opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="relative w-full sm:max-w-md rounded-t-[28px] sm:rounded-2xl border border-border/70 dark:border-white/[0.1] bg-card p-5 pb-8 sm:pb-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto"
            >
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto -mt-1 mb-2 sm:hidden shrink-0" />

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[16px] font-bold text-foreground tracking-tight">
                    {title}
                  </h3>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    {subtitle}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0 text-xs font-semibold"
                >
                  ✕
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  {unidades.map((u) => {
                    const isCurrent = activeUnitId === u.id;
                    const uLogo = u.logo_url || DEFAULT_COMPANY_LOGO;

                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          onSelectUnit(u);
                          onClose();
                        }}
                        className={cn(
                          "w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 active:scale-[0.99] group",
                          isCurrent
                            ? "bg-secondary/40 border-foreground/30 shadow-xs ring-1 ring-foreground/20"
                            : "bg-card border-border/70 dark:border-white/[0.08] hover:border-foreground/30 hover:bg-secondary/20"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={cn(
                              "rounded-xl flex items-center justify-center shrink-0 font-bold text-sm transition-colors overflow-hidden border border-border/40",
                              isCurrent
                                ? "bg-foreground text-background"
                                : "bg-secondary text-foreground group-hover:bg-secondary/80"
                            )}
                            style={{ width: 44, height: 44, minWidth: 44, minHeight: 44 }}
                          >
                            {uLogo ? (
                              <img
                                src={uLogo}
                                alt={u.nome}
                                className="w-full h-full object-cover"
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            ) : (
                              <Store className="w-5 h-5 stroke-[1.8]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-bold text-foreground truncate block leading-tight">
                                {u.nome}
                              </span>
                              {u.is_sede && (
                                <span className="text-[9.5px] font-semibold uppercase px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border/40 shrink-0">
                                  Sede
                                </span>
                              )}
                            </div>
                            <p className="text-[11.5px] text-muted-foreground truncate mt-1">
                              {[u.bairro, u.cidade].filter(Boolean).join(", ") || u.telefone || "Endereço não informado"}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0 pl-2">
                          {isCurrent ? (
                            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                              Gerenciando
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors flex items-center gap-0.5">
                              Selecionar
                              <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setWizardOpen(true)}
                  className="w-full h-11 rounded-xl bg-foreground text-background text-[13px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all hover:opacity-90 shadow-sm"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Cadastrar Nova Barbearia</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Wizard de Criação de Unidade */}
      <UnidadeWizardSheet
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        tenantId={tenantId || null}
        onSaved={() => {
          loadUnidades();
          setWizardOpen(false);
        }}
      />
    </>
  );
}
