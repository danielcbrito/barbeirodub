import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOldestOwnedTenant } from "@/lib/tenantOwnership";
import { toast } from "sonner";
import { useDeletarUnidade } from "@/hooks/useAdminMutations";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Plus, Users, ChevronRight,
  Loader2, Store,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { UnidadeWizardSheet } from "./wizard/UnidadeWizardSheet";
import { UnidadeDetailScreen } from "./UnidadeDetailScreen";
import profileBannerDefault from "@/assets/profile-banner-default.jpg";

export interface Unidade {
  id: string;
  tenant_id: string;
  nome: string;
  slug: string | null;
  cnpj: string | null;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  site: string | null;
  logo_url: string | null;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  slogan: string | null;
  ativo: boolean;
  is_sede: boolean;
  created_at: string;
  barber_count?: number;
}

interface AdminUnidadesProps {
  basePath?: string;
}

/**
 * Tela de gestão de unidades — design limpo, compacto, premium dark.
 */
export function AdminUnidades({ basePath = "/admin" }: AdminUnidadesProps) {
  const navigate = useNavigate();
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailUnidade, setDetailUnidade] = useState<Unidade | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let tId: string | null = null;
      const { data: tenant } = await resolveOldestOwnedTenant<{
        id: string;
        nome: string | null;
        cnpj: string | null;
        cpf: string | null;
        email: string | null;
        telefone: string | null;
        whatsapp: string | null;
        site: string | null;
        rua: string | null;
        numero: string | null;
        bairro: string | null;
        cidade: string | null;
        estado: string | null;
        logo_url: string | null;
        slug: string | null;
      }>(user.id, "id, nome, cnpj, cpf, email, telefone, whatsapp, site, rua, numero, bairro, cidade, estado, logo_url, slug");

      if (tenant?.id) {
        tId = tenant.id;
      } else {
        const { data: barb } = await supabase
          .from("barbeiros")
          .select("tenant_id")
          .eq("user_id", user.id)
          .not("tenant_id", "is", null)
          .maybeSingle();
        tId = barb?.tenant_id || null;
      }

      if (!tId) {
        toast.error("Tenant não encontrado");
        setLoading(false);
        return;
      }

      setTenantId(tId);

      const { data: infoRows } = await supabase
        .from("informacoes_empresa")
        .select("chave, valor, tenant_id")
        .or(`tenant_id.eq.${tId},tenant_id.is.null`)
        .in("chave", [
          "cnpj", "cpf", "email", "telefone", "whatsapp", "site",
          "rua", "numero", "complemento", "bairro", "cidade", "estado", "cep",
          "nome", "slogan", "logo_url",
        ]);

      const globalMap: Record<string, string> = {};
      const tenantMap: Record<string, string> = {};
      for (const row of (infoRows || [])) {
        if (row.tenant_id) {
          tenantMap[row.chave] = row.valor;
        } else {
          globalMap[row.chave] = row.valor;
        }
      }
      const infoMap: Record<string, string> = { ...globalMap, ...tenantMap };

      const pick = (tenantVal: string | null | undefined, key: string) => {
        const v = tenantVal && tenantVal.trim() ? tenantVal : infoMap[key];
        return v || null;
      };

      const sedePayload = {
        tenant_id: tId,
        nome: (tenant?.nome && tenant.nome.trim()) ? tenant.nome : infoMap["nome"] || "Sede Principal",
        slogan: (tenant as any)?.slogan || infoMap["slogan"] || null,
        cnpj: pick(tenant?.cnpj, "cnpj"),
        cpf: pick(tenant?.cpf, "cpf"),
        email: pick(tenant?.email, "email"),
        telefone: pick(tenant?.telefone, "telefone"),
        whatsapp: pick(tenant?.whatsapp, "whatsapp"),
        site: pick(tenant?.site, "site"),
        cep: infoMap["cep"] || null,
        rua: pick(tenant?.rua, "rua"),
        numero: pick(tenant?.numero, "numero"),
        complemento: infoMap["complemento"] || null,
        bairro: pick(tenant?.bairro, "bairro"),
        cidade: pick(tenant?.cidade, "cidade"),
        estado: pick(tenant?.estado, "estado"),
        logo_url: pick(tenant?.logo_url, "logo_url"),
        ativo: true,
        is_sede: true,
      };

      const { data: existingSede } = await supabase
        .from("tenant_unidades")
        .select("id, cnpj, email, rua")
        .eq("tenant_id", tId)
        .eq("is_sede", true)
        .maybeSingle();

      if (!existingSede) {
        await supabase.from("tenant_unidades").insert(sedePayload);
      } else {
        const isEmpty = !existingSede.cnpj && !existingSede.email && !existingSede.rua;
        if (isEmpty) {
          const { tenant_id: _, is_sede: __, ativo: ___, ...updatePayload } = sedePayload;
          await supabase.from("tenant_unidades").update(updatePayload).eq("id", existingSede.id);
        }
      }

      const { data: unidadesData, error } = await supabase
        .from("tenant_unidades")
        .select("id, tenant_id, nome, slug, slogan, site, whatsapp, logo_url, is_sede, ativo, rua, numero, bairro, cidade, estado, cep, complemento, cnpj, cpf, telefone, email, created_at")
        .eq("tenant_id", tId)
        .order("is_sede", { ascending: false })
        .order("created_at", { ascending: true });

      if (error) throw error;

      const { data: barberLinks } = await supabase
        .from("barbeiro_unidades")
        .select("unidade_id")
        .in("unidade_id", (unidadesData || []).map((u: any) => u.id));

      const { count: totalBarbers } = await supabase
        .from("barbeiros")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tId)
        .eq("ativo", true)
        .is("deleted_at", null);

      const countByUnidade: Record<string, number> = {};
      for (const link of barberLinks || []) {
        countByUnidade[link.unidade_id] = (countByUnidade[link.unidade_id] || 0) + 1;
      }

      const mapped = (unidadesData || []).map((u: any) => ({
        ...u,
        barber_count: countByUnidade[u.id] || (u.is_sede ? (totalBarbers || 0) : 0),
      }));

      setUnidades(mapped);
    } catch (error: any) {
      console.error("Erro ao carregar unidades:", error);
      toast.error("Erro ao carregar unidades");
    } finally {
      setLoading(false);
    }
  };

  // Delete handled via UnidadeDetailScreen → useDeletarUnidade hook

  const handleEdit = (unidade: Unidade) => {
    setDetailUnidade(unidade);
  };

  const handleAdd = () => {
    setWizardOpen(true);
  };

  /** Monta resumo curto de localização */
  const shortLocation = (u: Unidade) => {
    const parts = [u.bairro, u.cidade].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative min-h-[70vh] pb-28">
      {/* ── Header padrão do sistema ── */}
      <div
        className="flex items-center gap-2.5 px-5 h-14"
        style={{ marginTop: "var(--app-safe-top, env(safe-area-inset-top, 0px))" }}
      >
        <button
          onClick={() => navigate(`${basePath}/perfil`)}
          className="w-9 h-9 -ml-1 rounded-lg flex items-center justify-center active:opacity-70 transition-opacity"
          aria-label="Voltar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
            <path d="M9 14L4 9l5-5" />
            <path d="M4 9h10a4 4 0 0 1 4 4v1" />
          </svg>
        </button>
        <h1 className="text-[20px] font-semibold tracking-tight text-foreground flex-1 truncate">
          Barbearias
        </h1>
        <span className="text-[11px] text-muted-foreground/60 font-medium">
          {unidades.length} {unidades.length === 1 ? "unidade" : "unidades"}
        </span>
      </div>

      {/* ── Lista em banners ── */}
      {unidades.length === 0 ? (
        <EmptyState onAdd={handleAdd} />
      ) : (
        <div className="px-5 mt-4 space-y-4 max-w-2xl mx-auto">
          <AnimatePresence>
            {unidades.map((unidade, index) => {
              const loc = shortLocation(unidade);
              return (
                <motion.button
                  key={unidade.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.28 }}
                  onClick={() => handleEdit(unidade)}
                  className="w-full text-left rounded-2xl overflow-hidden border border-border/50 bg-card active:scale-[0.99] transition-transform"
                >
                  {/* Banner */}
                  <div className="relative h-24 w-full overflow-hidden bg-secondary">
                    <img
                      src={profileBannerDefault}
                      alt=""
                      aria-hidden
                      className="w-full h-full object-cover"
                      style={{ objectPosition: "center top" }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-card" />
                    {unidade.is_sede && (
                      <span className="absolute top-3 right-3 text-[9px] font-semibold text-primary bg-background/80 backdrop-blur-sm px-2 py-1 rounded-full uppercase tracking-wider">
                        Matriz
                      </span>
                    )}
                  </div>

                  {/* Logo + info */}
                  <div className="px-4 pb-4 -mt-7">
                    <div className="h-14 w-14 rounded-2xl border-[3px] border-card bg-secondary overflow-hidden flex items-center justify-center">
                      {unidade.logo_url ? (
                        <img src={unidade.logo_url} alt={unidade.nome} className="w-full h-full object-cover" />
                      ) : (
                        <Store className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[16px] font-semibold text-foreground truncate">
                          {unidade.nome}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          {loc && (
                            <span className="flex items-center gap-1 text-[11.5px] text-muted-foreground truncate">
                              <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                              {loc}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
                            <Users className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                            {unidade.barber_count || 0}
                          </span>
                          <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                            <span className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              unidade.ativo ? "bg-emerald-500" : "bg-muted-foreground/30"
                            )} />
                            {unidade.ativo ? "Ativa" : "Inativa"}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" strokeWidth={1.5} />
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* ── FAB: botão flutuante para adicionar ── */}
      <motion.button
        onClick={handleAdd}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3, type: "spring", stiffness: 260, damping: 20 }}
        className={cn(
          "fixed bottom-8 right-5 z-40",
          "w-12 h-12 rounded-full",
          "bg-foreground text-background",
          "flex items-center justify-center",
          "shadow-lg",
          "active:scale-95 transition-transform duration-150"
        )}
        aria-label="Nova unidade"
      >
        <Plus className="h-4.5 w-4.5" strokeWidth={2.5} />
      </motion.button>

      {/* Detail screen (full-screen) */}
      {detailUnidade && tenantId && (
        <UnidadeDetailScreen
          open={!!detailUnidade}
          onClose={() => setDetailUnidade(null)}
          unidade={detailUnidade}
          tenantId={tenantId}
          onSaved={loadData}
        />
      )}

      {/* Wizard de criação */}
      <UnidadeWizardSheet
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        tenantId={tenantId}
        onSaved={loadData}
      />
    </div>
  );
}


/* ─── Empty State ─── */
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="h-14 w-14 rounded-2xl bg-card border border-border flex items-center justify-center mb-4">
        <Store className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-foreground">
        Nenhuma unidade
      </h3>
      <p className="text-[12px] text-muted-foreground mt-1 max-w-[260px]">
        Adicione a primeira unidade da sua barbearia.
      </p>
    </motion.div>
  );
}
