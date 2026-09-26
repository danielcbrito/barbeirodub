import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Check, Crown, Loader2, Mail, RefreshCw, Search, Shield, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface BarberOption {
  id: string;
  apelido: string;
  foto_url: string | null;
  email?: string | null;
  user_id?: string | null;
}

/** Papel do profissional na barbearia */
type InviteRole = "barbeiro" | "admin" | "controle_total";

interface WizardStepBarbeirosProps {
  tenantId: string;
  selectedBarberIds: string[];
  onChange: (ids: string[]) => void;
  /** When true, hides title, filters by unit, shows remove button instead of resend */
  viewMode?: boolean;
  /** Required when viewMode=true — the unit to filter barbers by */
  unidadeId?: string;
}

/**
 * Step 4 — Barbeiros da unidade.
 * Formulário de convite com seletor de papel: Barbeiro, Admin da Unidade, Controle Total.
 * viewMode: exibe barbeiros vinculados à unidade com opções de gerenciar role e excluir.
 */
export function WizardStepBarbeiros({ tenantId, selectedBarberIds, onChange, viewMode = false, unidadeId }: WizardStepBarbeirosProps) {
  const [barbers, setBarbers] = useState<BarberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Form de convite
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("barbeiro");
  const [inviting, setInviting] = useState(false);

  const [resendingId, setResendingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  /** Mapa barbeiro_id -> role na unidade ('barbeiro' | 'admin') */
  const [barberRoles, setBarberRoles] = useState<Record<string, string>>({});
  /** Mapa barbeiro_id -> true se tem role tenant_admin/admin em user_roles (controle total) */
  const [barberGlobalAdmin, setBarberGlobalAdmin] = useState<Record<string, boolean>>({});
  const [togglingRoleId, setTogglingRoleId] = useState<string | null>(null);

  useEffect(() => { loadBarbers(); }, [tenantId, viewMode, unidadeId]);

  const loadBarbers = async () => {
    try {
      let barberQuery = supabase
        .from("barbeiros")
        .select("id, apelido, foto_url, user_id")
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .is("deleted_at", null)
        .order("apelido");

      // In viewMode, only show barbers linked to this specific unit
      if (viewMode && unidadeId) {
        const { data: links } = await (supabase
          .from("barbeiro_unidades")
          .select("barbeiro_id, role") as any)
          .eq("unidade_id", unidadeId);
        const linkedIds = (links || []).map((l: any) => l.barbeiro_id);

        // Carregar roles da unidade
        const roleMap: Record<string, string> = {};
        for (const l of links || []) {
          roleMap[l.barbeiro_id] = l.role || "barbeiro";
        }
        setBarberRoles(roleMap);

        if (linkedIds.length === 0) {
          setBarbers([]);
          setLoading(false);
          return;
        }
        barberQuery = barberQuery.in("id", linkedIds);
      }

      const { data, error } = await barberQuery;
      if (error) throw error;

      const barberIds = (data || []).map(b => b.id);
      const userIds = (data || []).filter(b => b.user_id).map(b => b.user_id!);
      let emailMap: Record<string, string> = {};

      // Carregar emails
      if (barberIds.length > 0) {
        const { data: privates } = await supabase
          .from("barbeiros_private")
          .select("barbeiro_id, email")
          .in("barbeiro_id", barberIds);
        for (const p of privates || []) {
          if (p.email) emailMap[p.barbeiro_id] = p.email;
        }
      }

      // Verificar quais barbeiros têm controle total (tenant_admin ou admin em user_roles)
      if (userIds.length > 0) {
        const { data: globalRoles } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", userIds)
          .in("role", ["admin", "tenant_admin"]);

        const globalAdminMap: Record<string, boolean> = {};
        const userToBarbeiro: Record<string, string> = {};
        for (const b of data || []) {
          if (b.user_id) userToBarbeiro[b.user_id] = b.id;
        }
        for (const r of globalRoles || []) {
          const bid = userToBarbeiro[r.user_id];
          if (bid) globalAdminMap[bid] = true;
        }
        setBarberGlobalAdmin(globalAdminMap);
      }

      setBarbers((data || []).map(b => ({ ...b, email: emailMap[b.id] || null })));
    } catch (err) {
      console.error("Erro ao carregar barbeiros:", err);
    } finally {
      setLoading(false);
    }
  };

  /** Alterna papel do barbeiro entre 'barbeiro' e 'admin' na unidade */
  const handleToggleRole = async (e: React.MouseEvent, barber: BarberOption) => {
    e.stopPropagation();
    if (togglingRoleId || !unidadeId) return;

    const currentRole = barberRoles[barber.id] || "barbeiro";
    const newRole = currentRole === "admin" ? "barbeiro" : "admin";

    setTogglingRoleId(barber.id);
    try {
      const { error } = await (supabase
        .from("barbeiro_unidades")
        .update({ role: newRole }) as any)
        .eq("unidade_id", unidadeId)
        .eq("barbeiro_id", barber.id);

      if (error) throw error;

      setBarberRoles(prev => ({ ...prev, [barber.id]: newRole }));
      toast.success(
        newRole === "admin"
          ? `${barber.apelido} agora é admin desta unidade`
          : `${barber.apelido} voltou a ser barbeiro`
      );
    } catch (err: any) {
      console.error("Erro ao alterar cargo:", err);
      toast.error("Erro ao alterar cargo");
    } finally {
      setTogglingRoleId(null);
    }
  };

  /** Promove/remove controle total (tenant_admin) */
  const handleToggleGlobalAdmin = async (e: React.MouseEvent, barber: BarberOption) => {
    e.stopPropagation();
    if (togglingRoleId || !barber.user_id) return;

    const isGlobal = barberGlobalAdmin[barber.id] || false;

    setTogglingRoleId(barber.id);
    try {
      if (isGlobal) {
        // Remover tenant_admin
        await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", barber.user_id)
          .eq("role", "tenant_admin" as any);

        setBarberGlobalAdmin(prev => ({ ...prev, [barber.id]: false }));
        toast.success(`${barber.apelido} não tem mais controle total`);
      } else {
        // Adicionar tenant_admin
        await supabase
          .from("user_roles")
          .upsert(
            { user_id: barber.user_id, role: "tenant_admin" as any },
            { onConflict: "user_id,role" }
          );

        setBarberGlobalAdmin(prev => ({ ...prev, [barber.id]: true }));
        toast.success(`${barber.apelido} agora tem controle total!`);
      }
    } catch (err: any) {
      console.error("Erro ao alterar controle total:", err);
      toast.error("Erro ao alterar permissão");
    } finally {
      setTogglingRoleId(null);
    }
  };

  /** Exclui barbeiro completamente do sistema via Edge Function */
  const handleRemoveFromUnit = async (e: React.MouseEvent, barber: BarberOption) => {
    e.stopPropagation();
    if (removingId) return;

    const confirmed = window.confirm(
      `Tem certeza que deseja EXCLUIR ${barber.apelido} completamente?\n\nIsso removerá todos os dados, agendamentos, financeiro e a conta deste barbeiro permanentemente. Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    setRemovingId(barber.id);
    try {
      const { data, error } = await supabase.functions.invoke("delete-barber", {
        body: { barbeiro_id: barber.id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao excluir barbeiro");

      toast.success(`${barber.apelido} foi excluído permanentemente`);
      onChange(selectedBarberIds.filter(id => id !== barber.id));
      setBarbers(prev => prev.filter(b => b.id !== barber.id));
    } catch (err: any) {
      console.error("Erro ao excluir barbeiro:", err);
      toast.error(err.message || "Erro ao excluir barbeiro");
    } finally {
      setRemovingId(null);
    }
  };

  const toggleBarber = (id: string) => {
    if (selectedBarberIds.includes(id)) {
      onChange(selectedBarberIds.filter(x => x !== id));
    } else {
      onChange([...selectedBarberIds, id]);
    }
  };

  /** Reenviar convite por e-mail */
  const handleResendInvite = async (e: React.MouseEvent, barber: BarberOption) => {
    e.stopPropagation();
    if (!barber.email || resendingId) return;

    setResendingId(barber.id);
    try {
      const { data, error } = await supabase.functions.invoke("create-tenant-barber", {
        body: { email: barber.email, invite_only: true, comissao_pct: 30 },
      });
      if (error) throw error;
      if (!data?.success && !data?.invited) throw new Error(data?.error || "Erro ao reenviar");
      toast.success("Convite reenviado para " + barber.email);
    } catch (err: any) {
      toast.error(err.message || "Erro ao reenviar convite");
    } finally {
      setResendingId(null);
    }
  };

  /** Convida barbeiro por e-mail com papel selecionado */
  const handleInviteBarber = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) { toast.error("Informe o e-mail do barbeiro"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("E-mail inválido"); return; }

    setInviting(true);
    try {
      // 1. Criar o barbeiro via edge function
      const { data, error } = await supabase.functions.invoke("create-tenant-barber", {
        body: { email, invite_only: true, comissao_pct: 30 },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao convidar barbeiro");

      const newBarberId = data?.barbeiro_id;

      // 2. Se tem unidade vinculada, definir role na barbeiro_unidades
      if (newBarberId && unidadeId && inviteRole !== "barbeiro") {
        // Atualizar role na tabela barbeiro_unidades (se já foi vinculado)
        await (supabase
          .from("barbeiro_unidades")
          .update({ role: inviteRole === "admin" ? "admin" : "barbeiro" }) as any)
          .eq("unidade_id", unidadeId)
          .eq("barbeiro_id", newBarberId);
      }

      // 3. Se controle total, adicionar tenant_admin no user_roles
      if (inviteRole === "controle_total" && data?.user_id) {
        await supabase
          .from("user_roles")
          .upsert(
            { user_id: data.user_id, role: "tenant_admin" as any },
            { onConflict: "user_id,role" }
          );
      }

      toast.success(
        inviteRole === "controle_total"
          ? "Convite enviado! O profissional terá controle total."
          : inviteRole === "admin"
            ? "Convite enviado! O profissional será admin desta unidade."
            : "Convite enviado! O barbeiro receberá um link no e-mail."
      );

      setInviteEmail("");
      setInviteRole("barbeiro");
      setShowInviteForm(false);
      await loadBarbers();
      if (newBarberId) onChange([...selectedBarberIds, newBarberId]);
    } catch (err: any) {
      toast.error(err.message || "Erro ao convidar barbeiro");
    } finally {
      setInviting(false);
    }
  };

  const filtered = barbers.filter(b =>
    b.apelido.toLowerCase().includes(search.toLowerCase()) ||
    (b.email && b.email.toLowerCase().includes(search.toLowerCase()))
  );

  /** Determina label do papel para exibição */
  const getRoleLabel = (barberId: string): { label: string; variant: "global" | "unit" | "barber" } => {
    if (barberGlobalAdmin[barberId]) return { label: "Controle Total", variant: "global" };
    if (barberRoles[barberId] === "admin") return { label: "Admin", variant: "unit" };
    return { label: "Barbeiro", variant: "barber" };
  };

  return (
    <div className="space-y-6">
      {/* Título — oculto em viewMode */}
      {!viewMode && (
        <div>
          <h2 className="text-[22px] font-semibold text-foreground leading-tight">
            Barbeiros da unidade
          </h2>
          <p className="text-[13px] text-foreground/90 mt-1">
            Selecione os profissionais que trabalharão nesta unidade.
          </p>
        </div>
      )}

      {/* Busca */}
      {barbers.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar barbeiro..."
            className="w-full h-12 pl-10 pr-3 rounded-full bg-card border border-border text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
          />
        </div>
      )}

      {/* Lista de barbeiros */}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-5 h-5 border-2 border-muted-foreground border-t-foreground rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 && !showInviteForm ? (
        <div className="text-center py-10 space-y-3">
          <Users className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-[13px] text-muted-foreground">
            {barbers.length === 0
              ? viewMode
                ? "Nenhum barbeiro vinculado a esta unidade."
                : "Nenhum barbeiro cadastrado. Convide o primeiro!"
              : "Nenhum resultado encontrado."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          <AnimatePresence>
            {filtered.map((barber) => {
              const isSelected = selectedBarberIds.includes(barber.id);
              const roleInfo = getRoleLabel(barber.id);

              return (
                <motion.div
                  key={barber.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="w-full flex items-center gap-3 py-4 text-left transition-colors"
                >
                  {/* Checkbox circular — oculto em viewMode */}
                  {!viewMode && (
                    <button onClick={() => toggleBarber(barber.id)} className="flex-shrink-0">
                      <div className={cn(
                        "w-6 h-6 rounded-full border-[1.5px] flex items-center justify-center transition-all duration-200",
                        isSelected ? "border-foreground bg-foreground" : "border-muted-foreground bg-transparent"
                      )}>
                        {isSelected && <Check className="w-3.5 h-3.5 text-background" strokeWidth={3} />}
                      </div>
                    </button>
                  )}

                  {/* Avatar */}
                  <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                    {barber.foto_url ? (
                      <img src={barber.foto_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[14px] font-bold text-muted-foreground/60">
                        {barber.apelido.charAt(0).toUpperCase()}
                      </span>
                    )}
                    {/* Badge de role no avatar */}
                    {viewMode && roleInfo.variant !== "barber" && (
                      <div className={cn(
                        "absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-background",
                        roleInfo.variant === "global" ? "bg-primary" : "bg-accent"
                      )}>
                        {roleInfo.variant === "global" ? (
                          <Crown className="w-3 h-3 text-primary-foreground" strokeWidth={2.5} />
                        ) : (
                          <ShieldCheck className="w-3 h-3 text-accent-foreground" strokeWidth={2.5} />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[14px] font-semibold text-foreground truncate">
                        {barber.apelido}
                      </p>
                      {viewMode && roleInfo.variant !== "barber" && (
                        <span className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0",
                          roleInfo.variant === "global"
                            ? "text-primary bg-primary/10"
                            : "text-accent-foreground bg-accent/20"
                        )}>
                          {roleInfo.label}
                        </span>
                      )}
                    </div>
                    {barber.email && (
                      <p className="text-[12px] text-foreground/70 truncate">{barber.email}</p>
                    )}
                  </div>

                  {/* Action buttons */}
                  {viewMode ? (
                    <div className="flex items-center gap-0.5 shrink-0">
                      {/* Botão Controle Total */}
                      {barber.user_id && (
                        <button
                          onClick={(e) => handleToggleGlobalAdmin(e, barber)}
                          disabled={togglingRoleId === barber.id}
                          title={barberGlobalAdmin[barber.id] ? "Remover controle total" : "Dar controle total"}
                          className={cn(
                            "h-8 w-8 rounded-lg flex items-center justify-center transition-all active:scale-90",
                            barberGlobalAdmin[barber.id]
                              ? "text-primary hover:text-primary/80 hover:bg-primary/10"
                              : "text-muted-foreground/40 hover:text-primary hover:bg-primary/10",
                            togglingRoleId === barber.id && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          {togglingRoleId === barber.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Crown className="w-4 h-4" strokeWidth={barberGlobalAdmin[barber.id] ? 2 : 1.5} />
                          )}
                        </button>
                      )}

                      {/* Botão Admin da unidade */}
                      <button
                        onClick={(e) => handleToggleRole(e, barber)}
                        disabled={togglingRoleId === barber.id}
                        title={barberRoles[barber.id] === "admin" ? "Remover admin" : "Tornar admin da unidade"}
                        className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center transition-all active:scale-90",
                          barberRoles[barber.id] === "admin"
                            ? "text-accent-foreground hover:text-accent-foreground/80 hover:bg-accent/20"
                            : "text-muted-foreground/40 hover:text-accent-foreground hover:bg-accent/20",
                          togglingRoleId === barber.id && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {togglingRoleId === barber.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : barberRoles[barber.id] === "admin" ? (
                          <ShieldCheck className="w-4 h-4" strokeWidth={2} />
                        ) : (
                          <Shield className="w-4 h-4" strokeWidth={1.5} />
                        )}
                      </button>

                      {/* Botão excluir */}
                      <button
                        onClick={(e) => handleRemoveFromUnit(e, barber)}
                        disabled={removingId === barber.id}
                        title="Excluir barbeiro"
                        className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center",
                          "text-destructive/70 hover:text-destructive hover:bg-destructive/10",
                          "transition-all active:scale-90",
                          removingId === barber.id && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {removingId === barber.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <X className="w-4 h-4" strokeWidth={2} />
                        )}
                      </button>
                    </div>
                  ) : (
                    barber.email && (
                      <button
                        onClick={(e) => handleResendInvite(e, barber)}
                        disabled={resendingId === barber.id}
                        title="Reenviar convite"
                        className={cn(
                          "flex-shrink-0 h-7 w-7 rounded-lg flex items-center justify-center",
                          "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                          "transition-all active:scale-90",
                          resendingId === barber.id && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {resendingId === barber.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
                        )}
                      </button>
                    )
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Convidar novo barbeiro */}
      <AnimatePresence>
        {showInviteForm ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-border bg-transparent p-4 space-y-4 overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-[14px] font-semibold text-foreground flex items-center gap-2">
                <Mail className="h-4 w-4 text-foreground" />
                Convidar profissional
              </h4>
              <button
                onClick={() => { setShowInviteForm(false); setInviteEmail(""); setInviteRole("barbeiro"); }}
                className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-secondary/50 transition-colors"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>

            <p className="text-[12px] text-muted-foreground leading-relaxed -mt-1">
              Informe o e-mail e defina o nível de acesso do profissional.
            </p>

            {/* E-mail input */}
            <InviteInput
              value={inviteEmail}
              onChange={setInviteEmail}
              label="E-mail *"
              placeholder="barbeiro@email.com"
              type="email"
            />

            {/* Role selector */}
            <div className="space-y-2">
              <label className="text-[12px] font-medium text-foreground/70">Nível de acesso</label>
              <div className="grid grid-cols-1 gap-2">
                <RoleOption
                  selected={inviteRole === "barbeiro"}
                  onClick={() => setInviteRole("barbeiro")}
                  icon={<Users className="w-4 h-4" />}
                  label="Barbeiro"
                  description="Acessa apenas sua agenda e serviços"
                  variant="default"
                />
                <RoleOption
                  selected={inviteRole === "admin"}
                  onClick={() => setInviteRole("admin")}
                  icon={<Shield className="w-4 h-4" />}
                  label="Admin da Unidade"
                  description="Gerencia barbeiros e agenda desta unidade"
                  variant="accent"
                />
                <RoleOption
                  selected={inviteRole === "controle_total"}
                  onClick={() => setInviteRole("controle_total")}
                  icon={<Crown className="w-4 h-4" />}
                  label="Controle Total"
                  description="Acesso completo a todas as unidades e configurações"
                  variant="primary"
                />
              </div>
            </div>

            <button
              onClick={handleInviteBarber}
              disabled={inviting || !inviteEmail.trim()}
              className={cn(
                "w-full h-12 rounded-xl text-[14px] font-semibold flex items-center justify-center gap-2",
                "bg-foreground text-background transition-all",
                inviting || !inviteEmail.trim()
                  ? "opacity-40 cursor-not-allowed"
                  : "hover:opacity-90 active:scale-[0.98]"
              )}
            >
              {inviting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              {inviting ? "Enviando..." : "Enviar convite"}
            </button>
          </motion.div>
        ) : (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowInviteForm(true)}
            className={cn(
              "w-full h-12 rounded-xl border-2 border-dashed border-border",
              "flex items-center justify-center gap-2",
              "text-muted-foreground hover:text-foreground hover:border-foreground/30",
              "transition-all active:scale-[0.98]"
            )}
          >
            <UserPlus className="h-4 w-4" strokeWidth={1.5} />
            <span className="text-[13px] font-medium">Convidar novo profissional</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Counter — oculto em viewMode */}
      {!viewMode && selectedBarberIds.length > 0 && (
        <p className="text-[12px] text-foreground/70 text-center font-medium">
          {selectedBarberIds.length} barbeiro{selectedBarberIds.length !== 1 ? "s" : ""} selecionado{selectedBarberIds.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Dica — oculto em viewMode */}
      {!viewMode && (
        <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
          Você pode adicionar ou remover barbeiros depois nas configurações.
        </p>
      )}

      {/* Legenda — visível em viewMode */}
      {viewMode && barbers.length > 0 && (
        <div className="space-y-1.5 pt-2">
          <div className="flex items-center gap-2 justify-center">
            <Crown className="w-3.5 h-3.5 text-primary/40" strokeWidth={1.5} />
            <p className="text-[11px] text-muted-foreground">Coroa = controle total</p>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <Shield className="w-3.5 h-3.5 text-muted-foreground/40" strokeWidth={1.5} />
            <p className="text-[11px] text-muted-foreground">Escudo = admin da unidade</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ Seletor visual de role no convite ═══ */
function RoleOption({
  selected, onClick, icon, label, description, variant,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
  variant: "default" | "accent" | "primary";
}) {
  const borderColor = selected
    ? variant === "primary"
      ? "border-primary"
      : variant === "accent"
        ? "border-accent"
        : "border-foreground"
    : "border-border";

  const bgColor = selected
    ? variant === "primary"
      ? "bg-primary/5"
      : variant === "accent"
        ? "bg-accent/10"
        : "bg-secondary/30"
    : "bg-transparent";

  return (
    <button
      onClick={onClick}
      type="button"
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-200",
        borderColor,
        bgColor,
        "hover:border-foreground/20 active:scale-[0.98]"
      )}
    >
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
        selected
          ? variant === "primary"
            ? "bg-primary/15 text-primary"
            : variant === "accent"
              ? "bg-accent/20 text-accent-foreground"
              : "bg-secondary text-foreground"
          : "bg-secondary/50 text-muted-foreground/50"
      )}>
        {icon}
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className={cn(
          "text-[13px] font-semibold",
          selected ? "text-foreground" : "text-muted-foreground"
        )}>
          {label}
        </p>
        <p className="text-[11px] text-muted-foreground/70 leading-snug">{description}</p>
      </div>
      <div className={cn(
        "w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-all",
        selected ? "border-foreground bg-foreground" : "border-muted-foreground/30 bg-transparent"
      )}>
        {selected && <Check className="w-3 h-3 text-background" strokeWidth={3} />}
      </div>
    </button>
  );
}

/* ═══ Input limpo para convite ═══ */
function InviteInput({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-medium text-foreground/70">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full h-12 px-4 rounded-xl bg-transparent border border-border",
          "text-[14px] text-foreground placeholder:text-muted-foreground/50",
          "focus:outline-none focus:border-foreground transition-colors duration-200"
        )}
      />
    </div>
  );
}
