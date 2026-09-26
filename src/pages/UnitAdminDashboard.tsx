import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, ChevronRight, Users, Calendar, BarChart3, Settings, LogOut,
  Loader2, MapPin, Shield,
} from "lucide-react";

interface UnitInfo {
  id: string;
  nome: string;
  cidade?: string | null;
  bairro?: string | null;
  estado?: string | null;
  ativo: boolean;
  barber_count: number;
}

/**
 * Painel do Admin de Unidade.
 * Exibe as unidades que o usuário administra e permite gerenciá-las.
 */
const UnitAdminDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<UnitInfo[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<UnitInfo | null>(null);

  useEffect(() => {
    loadAdminUnits();
  }, []);

  const loadAdminUnits = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/admin-unidade/login");
        return;
      }

      // Buscar barbeiro_ids do usuário
      const { data: barbers } = await supabase
        .from("barbeiros")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("ativo", true)
        .is("deleted_at", null);

      if (!barbers || barbers.length === 0) {
        navigate("/admin-unidade/login");
        return;
      }

      const barberIds = barbers.map(b => b.id);

      // Buscar unidades onde é admin
      const { data: adminLinks } = await (supabase
        .from("barbeiro_unidades")
        .select("unidade_id") as any)
        .in("barbeiro_id", barberIds)
        .eq("role", "admin");

      if (!adminLinks || adminLinks.length === 0) {
        navigate("/admin-unidade/login");
        return;
      }

      const unitIds = adminLinks.map(l => l.unidade_id);

      // Carregar dados das unidades
      const { data: unitData } = await supabase
        .from("tenant_unidades")
        .select("id, nome, cidade, bairro, estado, ativo")
        .in("id", unitIds)
        .order("nome");

      // Contar barbeiros por unidade
      const unitsWithCounts: UnitInfo[] = [];
      for (const u of unitData || []) {
        const { count } = await supabase
          .from("barbeiro_unidades")
          .select("id", { count: "exact", head: true })
          .eq("unidade_id", u.id);

        unitsWithCounts.push({
          ...u,
          barber_count: count || 0,
        });
      }

      setUnits(unitsWithCounts);

      // Se só tem uma unidade, selecionar automaticamente
      if (unitsWithCounts.length === 1) {
        setSelectedUnit(unitsWithCounts[0]);
      }
    } catch (err) {
      console.error("Erro ao carregar unidades:", err);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin-unidade/login");
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          <p className="text-[13px] text-muted-foreground">Carregando unidades...</p>
        </div>
      </div>
    );
  }

  // Se selecionou uma unidade, mostrar o dashboard dela
  if (selectedUnit) {
    return (
      <UnitDashboard
        unit={selectedUnit}
        onBack={units.length > 1 ? () => setSelectedUnit(null) : undefined}
        onLogout={handleLogout}
      />
    );
  }

  // Lista de unidades
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Header */}
      <div className="px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h1 className="text-[18px] font-bold text-foreground">Minhas Unidades</h1>
              <p className="text-[12px] text-muted-foreground">Admin de unidade</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-secondary/50 transition-colors"
          >
            <LogOut className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Unit cards */}
      <div className="flex-1 px-6 pb-8 space-y-3">
        {units.map((unit, index) => (
          <motion.button
            key={unit.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => setSelectedUnit(unit)}
            className={cn(
              "w-full p-4 rounded-2xl border border-border bg-card",
              "flex items-center gap-4 text-left",
              "hover:border-amber-500/30 hover:shadow-md transition-all active:scale-[0.98]"
            )}
          >
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-foreground truncate">{unit.nome}</p>
              {(unit.bairro || unit.cidade) && (
                <p className="text-[12px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 shrink-0" />
                  {[unit.bairro, unit.cidade].filter(Boolean).join(", ")}
                </p>
              )}
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Users className="w-3 h-3" /> {unit.barber_count} barbeiro{unit.barber_count !== 1 ? "s" : ""}
                </span>
                <span className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded",
                  unit.ativo ? "text-emerald-600 bg-emerald-500/10" : "text-muted-foreground bg-muted"
                )}>
                  {unit.ativo ? "Ativa" : "Inativa"}
                </span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground/30 shrink-0" />
          </motion.button>
        ))}
      </div>
    </div>
  );
};

/* ═══ Dashboard de uma unidade específica ═══ */
function UnitDashboard({
  unit,
  onBack,
  onLogout,
}: {
  unit: UnitInfo;
  onBack?: () => void;
  onLogout: () => void;
}) {
  const menuItems = [
    { icon: Users, label: "Barbeiros", desc: `${unit.barber_count} profissionais`, key: "barbeiros" },
    { icon: Calendar, label: "Agenda", desc: "Agendamentos da unidade", key: "agenda" },
    { icon: BarChart3, label: "Relatórios", desc: "Desempenho e estatísticas", key: "relatorios" },
    { icon: Settings, label: "Configurações", desc: "Dados e endereço", key: "config" },
  ];

  const handleMenuClick = (key: string) => {
    toast.info("Funcionalidade em breve! 🚧");
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Header */}
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-4">
        <div className="flex items-center gap-2.5">
          {onBack && (
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all -ml-1"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
                <path d="M9 14L4 9l5-5" />
                <path d="M4 9h10a4 4 0 0 1 4 4v1" />
              </svg>
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-[19px] font-bold text-foreground truncate">{unit.nome}</h1>
            {(unit.bairro || unit.cidade) && (
              <p className="text-[12px] text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3 shrink-0" />
                {[unit.bairro, unit.cidade].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          <button
            onClick={onLogout}
            className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-secondary/50 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="px-6 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-card border border-border">
            <p className="text-[24px] font-bold text-foreground">{unit.barber_count}</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">Barbeiros</p>
          </div>
          <div className="p-4 rounded-2xl bg-card border border-border">
            <p className={cn(
              "text-[24px] font-bold",
              unit.ativo ? "text-emerald-500" : "text-muted-foreground"
            )}>
              {unit.ativo ? "Ativa" : "Inativa"}
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5">Status</p>
          </div>
        </div>
      </div>

      {/* Menu */}
      <div className="flex-1 px-6 pb-8">
        <div className="space-y-0.5">
          {menuItems.map((item, index) => (
            <motion.button
              key={item.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              onClick={() => handleMenuClick(item.key)}
              className="w-full flex items-center gap-3.5 py-4 text-left active:bg-secondary/30 transition-colors border-b border-border/10 last:border-b-0"
            >
              <div className="w-10 h-10 rounded-xl bg-card border border-border/50 flex items-center justify-center shrink-0">
                <item.icon className="h-5 w-5 text-foreground/70" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-foreground">{item.label}</p>
                <p className="text-[11px] text-muted-foreground/60">{item.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" strokeWidth={1.5} />
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default UnitAdminDashboard;
