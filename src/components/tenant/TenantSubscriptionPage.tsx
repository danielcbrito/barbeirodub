import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crown, CheckCircle2, ChevronDown, ChevronUp, ChevronLeft,
  Users, Shield, Calendar, Star, Zap,
} from "lucide-react";
import type { TenantSubscriptionInfo } from "@/hooks/useTenantSubscription";

interface PlanTier {
  name: string;
  label: string;
  price: number;
  checkoutUrl: string;
}

const PLAN_TIERS: PlanTier[] = [
  { name: "DUB Solo",    label: "1 barbeiro",   price: 49.90,  checkoutUrl: "https://pay.cakto.com.br/3fu4u7q_789875" },
  { name: "DUB Dupla",   label: "2 barbeiros",  price: 79.90,  checkoutUrl: "https://pay.cakto.com.br/3aie3q5" },
  { name: "DUB Equipe",  label: "3 barbeiros",  price: 109.90, checkoutUrl: "https://pay.cakto.com.br/abri2ap" },
  { name: "DUB Pro",     label: "4 barbeiros",  price: 129.90, checkoutUrl: "https://pay.cakto.com.br/3epmyy9" },
  { name: "DUB Premium", label: "5+ barbeiros", price: 149.90, checkoutUrl: "https://pay.cakto.com.br/35fj7fi" },
];

function getTierByBarberCount(count: number): number {
  if (count <= 1) return 0;
  if (count === 2) return 1;
  if (count === 3) return 2;
  if (count === 4) return 3;
  return 4;
}

interface TenantSubscriptionPageProps {
  subscription: TenantSubscriptionInfo;
  basePath: string;
  tenantId?: string | null;
}

export function TenantSubscriptionPage({ subscription, basePath, tenantId }: TenantSubscriptionPageProps) {
  const navigate = useNavigate();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [barberCount, setBarberCount] = useState(1);

  useEffect(() => {
    if (!tenantId) return;
    const load = async () => {
      const { count } = await supabase
        .from("barbeiros")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .is("deleted_at", null);
      const qty = count || 1;
      setBarberCount(qty);
      setSelectedIndex(getTierByBarberCount(qty));
    };
    load();
  }, [tenantId]);

  const selected = PLAN_TIERS[selectedIndex];

  const benefits = [
    { icon: Calendar, text: "Agenda online 24h com confirmação automática" },
    { icon: Users, text: "Gestão completa de clientes e histórico" },
    { icon: Shield, text: "Financeiro com comissões e saques" },
    { icon: Zap, text: "Disparos automáticos via WhatsApp" },
    { icon: Star, text: "Relatórios e métricas do seu negócio" },
  ];

  return (
    <>
      <div className="h-full min-h-0 flex flex-col">
        {/* ═══ HEADER ═══ */}
        <div className="flex items-center gap-1.5 px-1 pt-2 pb-1">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-foreground/85 active:scale-95 transition-transform flex-shrink-0"
            aria-label="Voltar"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
          </button>
          <h1 className="text-[20px] text-foreground leading-tight" style={{ fontWeight: 900 }}>Minha Assinatura</h1>
        </div>

        <p className="text-[11px] text-muted-foreground/70 leading-relaxed px-1 mt-2 mb-1">
          Escolha uma opção conveniente a qualquer momento.
        </p>

        {/* ═══ CONTEÚDO ═══ */}
        <div className="flex-1 px-1 pt-6 space-y-5 overflow-y-auto">
          {/* Seletor de plano */}
          <div className="relative">
            <label className="absolute -top-2.5 left-3 px-1.5 bg-background text-[11px] text-foreground uppercase tracking-widest z-10" style={{ fontWeight: 900 }}>
              Escolha seu plano
            </label>
            <button
              onClick={() => setPickerOpen(true)}
              className="w-full h-14 px-4 rounded-xl border border-border bg-card hover:border-foreground/20 active:scale-[0.995] transition-all"
            >
              <div className="flex items-center justify-between gap-3 w-full">
                <span className="text-[16px] text-foreground tracking-tight truncate text-left" style={{ fontWeight: 900 }}>
                  {selected.name} — {selected.label}
                </span>
                <ChevronDown className="w-5 h-5 text-foreground flex-shrink-0" strokeWidth={2.5} />
              </div>
            </button>
          </div>

          {/* Status ativo */}
          {subscription.isActive && !subscription.isTrial && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3 p-4 rounded-xl border border-border/50 bg-card"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[13px] text-foreground" style={{ fontWeight: 900 }}>Assinatura ativa</p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  Seu plano suporta até {barberCount} {barberCount === 1 ? "barbeiro" : "barbeiros"}.
                </p>
              </div>
            </motion.div>
          )}

          {/* Benefícios — incluso em todos os planos */}
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <p className="text-[11px] uppercase tracking-wider mb-3 text-muted-foreground" style={{ fontWeight: 900 }}>
              Incluso em todos os planos
            </p>
            <div className="space-y-2.5">
              {benefits.map((b, i) => (
                <div key={i} className="flex items-center gap-3">
                  <b.icon className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" strokeWidth={1.5} />
                  <span className="text-[12px] text-foreground/60">{b.text}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* ═══ RODAPÉ — fixo no fundo ═══ */}
        <div className="flex-shrink-0 px-2 pb-1 pt-4">
          <div className="border-t border-border/30 pt-4">
            <div className="flex items-baseline gap-1 justify-end mb-4">
              <span className="text-[34px] text-foreground leading-none tracking-tighter" style={{ fontWeight: 900 }}>
                R$ {selected.price.toFixed(2).replace(".", ",")}
              </span>
              <span className="text-[15px] text-foreground" style={{ fontWeight: 800 }}>/ mês</span>
            </div>

            <button
              onClick={() => window.open(selected.checkoutUrl, "_blank")}
              className="w-full h-[52px] rounded-xl bg-foreground text-background text-[15px] hover:opacity-90 active:scale-[0.98] transition-all"
              style={{ fontWeight: 900 }}
            >
              Assinar
            </button>

            <p className="text-center text-[10px] text-muted-foreground/50 mt-2">
              Sem taxa de adesão • Cancele quando quiser
            </p>
          </div>
        </div>
      </div>

      {/* ═══ CARROSSEL VERTICAL FULLSCREEN ═══ */}
      <AnimatePresence>
        {pickerOpen && (
          <VerticalSnapCarousel
            selectedIndex={selectedIndex}
            onSelect={(i) => { setSelectedIndex(i); setPickerOpen(false); }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ─────────────────────────────────────────────
   Carrossel vertical com snap scroll real (swipe)
   O item no centro da viewport é o selecionado.
   ───────────────────────────────────────────── */

const ITEM_HEIGHT = 56; // px
const VISIBLE_ITEMS = 5;

interface VerticalSnapCarouselProps {
  selectedIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}

function VerticalSnapCarousel({ selectedIndex, onSelect, onClose }: VerticalSnapCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);

  // Padding para centralizar o primeiro e último item
  const paddingItems = Math.floor(VISIBLE_ITEMS / 2);

  /** Scroll para o item ativo ao abrir */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = activeIndex * ITEM_HEIGHT;
    }
  }, []);

  /** Detectar item central após scroll */
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const scrollTop = scrollRef.current.scrollTop;
    const newIndex = Math.round(scrollTop / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(PLAN_TIERS.length - 1, newIndex));
    if (clampedIndex !== activeIndex) {
      setActiveIndex(clampedIndex);
    }
  }, [activeIndex]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background flex flex-col pt-[env(safe-area-inset-top)]"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button
          onClick={onClose}
          className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-foreground/85 active:scale-95 transition-transform"
          aria-label="Voltar"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
        </button>
        <h1 className="text-[18px] font-bold text-foreground">Minha Assinatura</h1>
      </div>

      {/* Carrossel com snap scroll */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Seta cima */}
        <button
          onClick={() => {
            if (activeIndex > 0) {
              const newIdx = activeIndex - 1;
              setActiveIndex(newIdx);
              scrollRef.current?.scrollTo({ top: newIdx * ITEM_HEIGHT, behavior: "smooth" });
            }
          }}
          className={`mb-3 transition-opacity ${activeIndex > 0 ? "opacity-30 hover:opacity-60" : "opacity-0 pointer-events-none"}`}
        >
          <ChevronUp className="w-7 h-7 text-muted-foreground" strokeWidth={1.5} />
        </button>

        {/* Scroll container */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="w-full max-w-sm overflow-y-auto scrollbar-none"
          style={{
            height: ITEM_HEIGHT * VISIBLE_ITEMS,
            scrollSnapType: "y mandatory",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {/* Padding top */}
          <div style={{ height: ITEM_HEIGHT * paddingItems }} />

          {PLAN_TIERS.map((tier, i) => {
            const isActive = i === activeIndex;
            const distance = Math.abs(i - activeIndex);
            return (
              <div
                key={tier.name}
                onClick={() => {
                  setActiveIndex(i);
                  scrollRef.current?.scrollTo({ top: i * ITEM_HEIGHT, behavior: "smooth" });
                }}
                className="flex items-center justify-center cursor-pointer transition-all duration-200"
                style={{
                  height: ITEM_HEIGHT,
                  scrollSnapAlign: "center",
                  opacity: distance === 0 ? 1 : distance === 1 ? 0.4 : 0.2,
                  transform: `scale(${distance === 0 ? 1 : 0.92})`,
                }}
              >
                <div className={`w-full mx-6 py-3 px-5 rounded-xl text-center transition-all duration-200 ${
                  isActive ? "border-2 border-foreground" : "border border-transparent"
                }`}>
                  <span className={`text-[15px] font-extrabold tracking-tight ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                    {tier.name} — {tier.label}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Padding bottom */}
          <div style={{ height: ITEM_HEIGHT * paddingItems }} />
        </div>

        {/* Seta baixo */}
        <button
          onClick={() => {
            if (activeIndex < PLAN_TIERS.length - 1) {
              const newIdx = activeIndex + 1;
              setActiveIndex(newIdx);
              scrollRef.current?.scrollTo({ top: newIdx * ITEM_HEIGHT, behavior: "smooth" });
            }
          }}
          className={`mt-3 transition-opacity ${activeIndex < PLAN_TIERS.length - 1 ? "opacity-30 hover:opacity-60" : "opacity-0 pointer-events-none"}`}
        >
          <ChevronDown className="w-7 h-7 text-muted-foreground" strokeWidth={1.5} />
        </button>
      </div>

      {/* Botão OK */}
      <div className="px-6 pb-8">
        <button
          onClick={() => onSelect(activeIndex)}
          className="w-full h-[52px] rounded-xl bg-foreground text-background text-[15px] font-black hover:opacity-90 active:scale-[0.98] transition-all"
        >
          OK
        </button>
      </div>
    </motion.div>
  );
}
