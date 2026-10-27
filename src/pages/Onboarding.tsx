import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStatusBarColor } from "@/hooks/useStatusBarColor";
import { StepEndereco, EnderecoData } from "@/components/barber/setup/StepEndereco";
import { StepHorarios } from "@/components/barber/setup/StepHorarios";
import { StepServicos } from "@/components/barber/setup/StepServicos";

/**
 * ONBOARDING — fluxo curto dentro do próprio app do dono (tenant_admin).
 * 4 passos: Nome da barbearia → Endereço → Horários → Serviços.
 * Visual iFood dark (#0A0A0A) contínuo do cadastro.
 */

type HorariosViewMode = "list" | "day" | "advanced";
type ServicosViewMode = "list" | "edit";

const BG = "hsl(var(--background))";
const EASE: [number, number, number, number] = [0.25, 0.9, 0.35, 1];
const TOTAL_STEPS = 4;

const Onboarding = () => {
  const navigate = useNavigate();

  useStatusBarColor("app-background");

  // ── State ──
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [barbeiroId, setBarbeiroId] = useState<string | null>(null);

  const [step, setStep] = useState(1);
  const [nome, setNome] = useState("");
  const [nomeError, setNomeError] = useState<string | null>(null);
  const [endereco, setEndereco] = useState<EnderecoData>({
    cep: "", rua: "", numero: "", bairro: "", cidade: "", estado: "",
  });
  const [enderecoErrors, setEnderecoErrors] = useState<Partial<Record<keyof EnderecoData, string>>>({});

  const [horariosView, setHorariosView] = useState<HorariosViewMode>("list");
  const [servicosView, setServicosView] = useState<ServicosViewMode>("list");
  const [servicosAddTrigger, setServicosAddTrigger] = useState(0);
  const [servicosResetTrigger, setServicosResetTrigger] = useState(0);
  const [horariosResetTrigger, setHorariosResetTrigger] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Sempre que trocar de etapa ou de sub-view, rola o conteúdo pro topo
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [step, servicosView, horariosView]);



  // ── Init: verifica sessão + tenant existente ──
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { navigate("/", { replace: true }); return; }
        if (!mounted) return;
        setUserId(session.user.id);

        const { data: tenant } = await supabase
          .from("tenants")
          .select("id, nome, onboarding_completed, onboarding_step, rua, numero, bairro, cidade, estado")
          .eq("owner_user_id", session.user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!mounted) return;

        if (tenant) {
          // Só redireciona se o wizard já foi percorrido inteiro.
          // Barbearias marcadas como onboarding_completed no meio do fluxo
          // (visibilidade antecipada para clientes) ainda podem retomar aqui.
          if ((tenant.onboarding_step ?? 0) >= TOTAL_STEPS) {
            navigate("/admin", { replace: true });
            return;
          }
          setTenantId(tenant.id);
          setNome(tenant.nome || "");
          setEndereco({
            cep: "",
            rua: tenant.rua || "",
            numero: tenant.numero || "",
            bairro: tenant.bairro || "",
            cidade: tenant.cidade || "",
            estado: tenant.estado || "",
          });
          const s = Math.max(1, Math.min(TOTAL_STEPS, tenant.onboarding_step || 1));
          setStep(s);
        }
      } catch (err) {
        console.error("Erro ao inicializar onboarding:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [navigate]);

  // ── Garante barbeiro ao chegar em Horários ──
  useEffect(() => {
    (async () => {
      if (step !== 3 || !userId || !tenantId || barbeiroId) return;
      const { data: { user } } = await supabase.auth.getUser();
      const ownerPersonalName =
        (user?.user_metadata as any)?.nome?.trim() || "Proprietário";
      const { data: id, error } = await supabase.rpc("ensure_tenant_barber", {
        p_user_id: userId,
        p_apelido: ownerPersonalName,
      });
      if (error) { toast.error("Erro ao preparar horários"); return; }
      if (id) {
        await supabase.rpc("blank_barber_hours_if_untouched", { p_barbeiro_id: id });
        setBarbeiroId(id);
      }
    })();
  }, [step, userId, tenantId, barbeiroId]);


  // ── Persistência ──
  const saveTenant = async (
    patch: Record<string, any>,
    opts?: { completed?: boolean }
  ): Promise<string | null> => {
    if (!userId) return null;
    const payload: Record<string, any> = {
      owner_user_id: userId,
      onboarding_step: patch.onboarding_step ?? step,
      ...patch,
    };
    // Só toca em onboarding_completed quando explicitamente informado,
    // para não desfazer a visibilidade antecipada em updates parciais.
    if (opts && typeof opts.completed === "boolean") {
      payload.onboarding_completed = opts.completed;
    }
    if (tenantId) {
      const { error } = await supabase.from("tenants").update(payload as any).eq("id", tenantId);
      if (error) { console.error(error); toast.error("Não foi possível salvar"); return null; }
      return tenantId;
    }
    await supabase.rpc("assign_tenant_admin_role", { p_user_id: userId });
    // Ao criar a barbearia (step 1) já marca como completa para aparecer
    // no app do cliente imediatamente. Os passos restantes são opcionais.
    const insertPayload = { ...payload, onboarding_completed: true };
    const { data, error } = await supabase.from("tenants").insert(insertPayload as any).select("id").single();
    if (error) { console.error(error); toast.error("Não foi possível criar sua barbearia"); return null; }
    setTenantId(data.id);
    return data.id;
  };

  // ── Handlers ──
  const validateEndereco = (): boolean => {
    const errs: Partial<Record<keyof EnderecoData, string>> = {};
    if (!endereco.cep.trim()) errs.cep = "Obrigatório";
    if (!endereco.rua.trim()) errs.rua = "Obrigatório";
    if (!endereco.numero.trim()) errs.numero = "Obrigatório";
    if (!endereco.bairro.trim()) errs.bairro = "Obrigatório";
    if (!endereco.cidade.trim()) errs.cidade = "Obrigatório";
    if (!endereco.estado.trim() || endereco.estado.length !== 2) errs.estado = "UF inválida";
    setEnderecoErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (step === 1) {
        const trimmed = nome.trim();
        if (!trimmed || trimmed.length < 2) {
          setNomeError("Digite o nome da sua barbearia");
          return;
        }
        // Verifica se já existe uma barbearia com o mesmo nome (case-insensitive)
        const { data: existing } = await supabase
          .from("tenants")
          .select("id, owner_user_id")
          .ilike("nome", trimmed)
          .limit(5);
        const conflict = (existing || []).some(
          (t) => t.owner_user_id !== userId
        );
        if (conflict) {
          setNomeError("Esse nome já está em uso. Tente outro.");
          return;
        }
        setNomeError(null);
        const id = await saveTenant({ nome: trimmed, onboarding_step: 2 });
        if (!id) return;
        setStep(2);
      } else if (step === 2) {
        if (!validateEndereco()) return;
        const id = await saveTenant({
          rua: endereco.rua,
          numero: endereco.numero,
          bairro: endereco.bairro,
          cidade: endereco.cidade,
          estado: endereco.estado,
          endereco_completo: [endereco.rua, endereco.numero, endereco.bairro, endereco.cidade, endereco.estado].filter(Boolean).join(", "),
          onboarding_step: 3,
        });
        if (!id) return;
        setStep(3);
      } else if (step === 3) {
        await saveTenant({ onboarding_step: 4 });
        setStep(4);
      } else if (step === 4) {
        await handleFinish();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (step === 3 && horariosView !== "list") {
      setHorariosResetTrigger((t) => t + 1);
      setHorariosView("list");
      return;
    }
    if (step === 4 && servicosView !== "list") {
      setServicosResetTrigger((t) => t + 1);
      setServicosView("list");
      return;
    }
    setStep((s) => Math.max(1, s - 1));
  };

  const handleSkip = async () => {
    if (saving) return;
    // Se estiver em uma sub-view (novo serviço, editar horário), primeiro volta pra lista
    if (step === 3 && horariosView !== "list") {
      setHorariosResetTrigger((t) => t + 1);
      setHorariosView("list");
      return;
    }
    if (step === 4 && servicosView !== "list") {
      setServicosResetTrigger((t) => t + 1);
      setServicosView("list");
      return;
    }

    setSaving(true);
    try {
      if (step >= TOTAL_STEPS) {
        await handleFinish();
        return;
      }
      const nextStep = step + 1;
      let id = tenantId;
      if (!id) {
        id = await saveTenant({ nome: nome.trim() || "Minha Barbearia", onboarding_step: nextStep });
        if (!id) return;
      } else {
        await supabase.from("tenants").update({ onboarding_step: nextStep }).eq("id", id);
      }
      setStep(nextStep);
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async () => {
    if (!userId || !tenantId) return;

    const { data: { user } } = await supabase.auth.getUser();
    const ownerName =
      (user?.user_metadata as any)?.nome?.trim() || "Proprietário";
    const { data: ensuredBarberId, error: barberError } = await supabase.rpc("ensure_tenant_barber", {
      p_user_id: userId,
      p_apelido: ownerName,
    });


    if (barberError || !ensuredBarberId) {
      console.error("Erro ao preparar barbeiro do tenant:", barberError);
      toast.error("Não foi possível preparar seu perfil profissional. Tente novamente.");
      return;
    }

    setBarbeiroId(ensuredBarberId);

    const { error } = await supabase
      .from("tenants")
      .update({ onboarding_completed: true, onboarding_step: TOTAL_STEPS })
      .eq("id", tenantId);
    if (error) { toast.error("Erro ao finalizar"); return; }

    // Seed informacoes_empresa (silencioso)
    try {
      const entries = [
        { chave: "nome", categoria: "empresa", valor: nome },
        { chave: "rua", categoria: "localizacao", valor: endereco.rua },
        { chave: "numero", categoria: "localizacao", valor: endereco.numero },
        { chave: "bairro", categoria: "localizacao", valor: endereco.bairro },
        { chave: "cidade", categoria: "localizacao", valor: endereco.cidade },
        { chave: "estado", categoria: "localizacao", valor: endereco.estado },
        { chave: "cep", categoria: "localizacao", valor: endereco.cep },
      ].filter((e) => e.valor?.trim());
      if (entries.length) {
        await supabase.from("informacoes_empresa").insert(
          entries.map((e) => ({ ...e, tenant_id: tenantId, ativo: true, atualizado_em: new Date().toISOString() })) as any
        );
      }
    } catch { /* non-blocking */ }

    setTimeout(() => navigate("/admin", { replace: true }), 400);
  };

  // ── UI ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh" style={{ background: BG }}>
        <Loader2 className="h-5 w-5 text-foreground/60 animate-spin" />
      </div>
    );
  }

  const isDetailView =
    (step === 3 && horariosView !== "list") || (step === 4 && servicosView !== "list");

  const ctaLabel =
    step === TOTAL_STEPS ? "Concluir" : "Continuar";

  const canGoBack = step > 1;

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: BG }}>
      {/* Header + progress */}
      <div
        className="shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
      >
        <div className="h-12 px-2 flex items-center">
          {canGoBack ? (
            <button
              onClick={handleBack}
              className="h-10 w-10 flex items-center justify-center text-foreground/90 active:opacity-60"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2.2} />
            </button>
          ) : (
            <div className="h-10 w-10" />
          )}
          <div className="flex-1 text-center text-[13px] text-foreground/60 font-medium">
            {step} de {TOTAL_STEPS}
          </div>
          <button
            onClick={handleSkip}
            disabled={saving}
            className="h-10 px-3 flex items-center justify-center text-[13px] font-medium text-foreground/70 hover:text-foreground active:opacity-60 disabled:opacity-40"
          >
            Pular
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-[3px] bg-foreground/10 mx-4 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={false}
            animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            transition={{ duration: 0.4, ease: EASE }}
          />
        </div>
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className={cn(
          "flex-1 overflow-y-auto px-6 pt-8",
          isDetailView ? "pb-[120px]" : "pb-6"
        )}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.28, ease: EASE }}
          >
            {step === 1 && (
              <StepNome
                value={nome}
                onChange={(v) => { setNome(v); if (nomeError) setNomeError(null); }}
                error={nomeError}
              />
            )}

            {step === 2 && (
              <div className="[&_h2]:text-foreground [&_h2]:text-[24px] [&_p]:text-foreground/70 [&_legend]:text-foreground/50 [&_input]:text-foreground [&_input]:placeholder:text-foreground/30 [&_.text-foreground]:text-foreground [&_.text-foreground\\/60]:text-foreground/60 [&_.text-foreground\\/80]:text-foreground/80 [&_.text-muted-foreground]:text-foreground/40 [&_.text-muted-foreground\\/70]:text-foreground/40">
                <StepEndereco
                  data={endereco}
                  onChange={(next) => {
                    setEndereco(next);
                    if (Object.keys(enderecoErrors).length) {
                      const cleared: Partial<Record<keyof EnderecoData, string>> = { ...enderecoErrors };
                      (Object.keys(next) as (keyof EnderecoData)[]).forEach((k) => {
                        if (next[k]?.toString().trim()) delete cleared[k];
                      });
                      setEnderecoErrors(cleared);
                    }
                  }}
                  errors={enderecoErrors}
                />
              </div>
            )}

            {step === 3 && (
              <div className="text-foreground [&_h2]:text-foreground [&_p]:text-foreground/70">
                <StepHorarios
                  barbeiroId={barbeiroId ?? undefined}
                  onViewModeChange={setHorariosView}
                  isOnboardingFlow
                  resetToListSignal={horariosResetTrigger}
                />
              </div>
            )}

            {step === 4 && (
              <div className="text-foreground [&_h2]:text-foreground [&_p]:text-foreground/70">
                <StepServicos
                  tenantId={tenantId}
                  onViewModeChange={setServicosView}
                  addTrigger={servicosAddTrigger}
                  resetTrigger={servicosResetTrigger}
                />

              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom CTA */}
      {!isDetailView && (
        <div
          className="shrink-0 px-6 pt-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
        >
          {step === 4 && (
            <button
              onClick={() => setServicosAddTrigger((t) => t + 1)}
              className="w-full h-12 mb-3 rounded-xl border border-foreground/20 text-foreground text-[14px] font-medium active:opacity-70"
            >
              + Adicionar serviço
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={saving}
            className={cn(
              "w-full h-[52px] rounded-xl bg-foreground text-background text-[15px] font-semibold flex items-center justify-center gap-2",
              "active:opacity-80 disabled:opacity-50"
            )}
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : step === TOTAL_STEPS ? (
              <>
                <Check className="h-5 w-5" strokeWidth={2.5} />
                {ctaLabel}
              </>
            ) : (
              ctaLabel
            )}
          </button>
        </div>
      )}
    </div>
  );
};

/* ─────────── Step 1 — Nome da barbearia ─────────── */
function StepNome({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused || !!value;
  const hasError = !!error;

  return (
    <div className="space-y-8 pt-2">
      <div>
        <h2 className="text-[26px] font-semibold text-foreground leading-tight">
          Qual é o nome da sua barbearia?
        </h2>
        <p className="text-[14px] text-foreground/60 mt-2">
          É assim que ela vai aparecer para os seus clientes.
        </p>
      </div>

      <div>
        <div
          className={cn(
            "relative rounded-xl border-2 px-4 transition-colors",
            hasError
              ? "border-destructive"
              : focused
                ? "border-primary"
                : "border-foreground/15"
          )}
        >
          <label
            className={cn(
              "absolute left-4 pointer-events-none transition-all duration-200",
              active
                ? "top-2 text-[11px] text-foreground/50 font-medium"
                : "top-1/2 -translate-y-1/2 text-[15px] text-foreground/40"
            )}
          >
            Nome da barbearia
          </label>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoFocus
            maxLength={80}
            className={cn(
              "w-full bg-transparent outline-none text-[16px] text-foreground",
              active ? "pt-6 pb-2" : "py-5"
            )}
          />
        </div>
        {hasError && (
          <p className="text-[12px] text-destructive mt-2 ml-1">{error}</p>
        )}
      </div>
    </div>
  );
}

export default Onboarding;
