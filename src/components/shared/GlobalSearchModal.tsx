import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  X,
  ChevronLeft,
  Calendar,
  DollarSign,
  Users,
  Scissors,
  Send,
  Star,
  Settings,
  Clock,
  ShoppingBag,
  BarChart3,
  Headset,
  Shield,
  Tag,
  ChevronRight,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface GlobalSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  basePath?: "/admin" | "/barber";
  tenantId?: string | null;
}

interface SearchModuleItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  route: string;
  keywords: string[];
  externalUrl?: string;
}

interface DynamicClient {
  id: string;
  nome: string;
  telefone?: string | null;
}

interface DynamicService {
  id: string;
  nome: string;
  preco: number;
  duracao_minutos: number;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  const matrix = Array.from({ length: s2.length + 1 }, () =>
    new Array(s1.length + 1).fill(0)
  );

  for (let i = 0; i <= s1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= s2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= s2.length; j++) {
    for (let i = 1; i <= s1.length; i++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }

  return matrix[s2.length][s1.length];
}

function matchesSearch(query: string, target: string, keywords: string[] = []): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const t = normalizeText(target);

  if (t.includes(q)) return true;

  for (const kw of keywords) {
    const normKw = normalizeText(kw);
    if (normKw.includes(q) || q.includes(normKw)) return true;

    if (q.length >= 4 && normKw.length >= 4) {
      const maxDist = q.length <= 5 ? 1 : 2;
      if (levenshteinDistance(q, normKw) <= maxDist) return true;
    }
  }

  if (q.length >= 4 && t.length >= 4) {
    const maxDist = q.length <= 5 ? 1 : 2;
    if (levenshteinDistance(q, t) <= maxDist) return true;
  }

  return false;
}

export function GlobalSearchModal({
  open,
  onOpenChange,
  basePath = "/admin",
  tenantId = null
}: GlobalSearchModalProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [clients, setClients] = useState<DynamicClient[]>([]);
  const [services, setServices] = useState<DynamicService[]>([]);

  // Travar scroll do body quando aberto
  useEffect(() => {
    if (!open) return;
    const prevBody = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
    };
  }, [open]);

  // Carregar dados dinâmicos em background
  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }

    const t = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    const loadAppData = async () => {
      try {
        let servQuery = supabase
          .from("servicos")
          .select("id, nome, preco, duracao_minutos")
          .eq("ativo", true);
        if (tenantId) servQuery = servQuery.eq("tenant_id", tenantId);

        const [clientsRes, servRes] = await Promise.all([
          supabase.from("profiles").select("id, nome, telefone").order("nome").limit(100),
          servQuery.order("nome")
        ]);

        if (clientsRes.data) setClients(clientsRes.data);
        if (servRes.data) setServices(servRes.data);
      } catch (err) {
        console.error("[GlobalSearch] Erro ao carregar dados:", err);
      }
    };

    loadAppData();
    return () => clearTimeout(t);
  }, [open, tenantId]);

  const appModules: SearchModuleItem[] = useMemo(() => {
    const isBarber = basePath === "/barber";
    return [
      {
        id: "agenda",
        title: "Agenda",
        subtitle: "Visualizar e marcar horários",
        icon: Calendar,
        route: `${basePath}/agenda`,
        keywords: ["agenda", "agendamentos", "horarios", "calendario", "marcar", "compromissos", "dia", "semana", "vagas", "encaixe"]
      },
      {
        id: "financeiro",
        title: "Financeiro",
        subtitle: "Faturamento, receita, pagamentos e caixa",
        icon: DollarSign,
        route: `${basePath}/financeiro`,
        keywords: [
          "financeiro", "dinheiro", "faturamento", "receita", "lucro", "caixa", 
          "pagamentos", "pagamento", "grana", "extrato", "comissao", "pix", 
          "ganhos", "renda", "valores", "contabilidade"
        ]
      },
      {
        id: "clientes",
        title: "Clientes",
        subtitle: "Lista e cadastro de clientes",
        icon: Users,
        route: `${basePath}/clientes`,
        keywords: ["clientes", "cliente", "fregues", "fregueses", "contatos", "cadastros", "telefones", "usuarios", "pessoas"]
      },
      {
        id: "disparo",
        title: "Disparo WhatsApp",
        subtitle: "Envio de mensagens em massa",
        icon: Send,
        route: isBarber ? `${basePath}/agenda` : "/admin/disparo",
        keywords: ["disparo", "whatsapp", "zap", "mensagens", "notificacoes", "marketing", "massa", "envio", "aviso", "campanha", "promo"]
      },
      {
        id: "servicos",
        title: "Cortes e Serviços",
        subtitle: "Tabela de preços e procedimentos",
        icon: Scissors,
        route: isBarber ? "/barber/cortes" : "/admin/servicos/cortes",
        keywords: ["servicos", "servico", "cortes", "corte", "cabelo", "barba", "sobrancelha", "precos", "preco", "catalogo", "tabela", "degrade", "pezinho"]
      },
      {
        id: "planos",
        title: "Planos e Assinaturas",
        subtitle: "Clube de assinaturas e mensalidades",
        icon: Tag,
        route: isBarber ? "/barber/agenda" : "/admin/servicos/planos",
        keywords: ["planos", "plano", "assinaturas", "assinatura", "mensalidades", "mensalidade", "clube", "membros", "recorrencia", "vip"]
      },
      {
        id: "relatorios",
        title: "Relatórios",
        subtitle: "Estatísticas e métricas de desempenho",
        icon: BarChart3,
        route: isBarber ? `${basePath}/financeiro` : "/admin/relatorios",
        keywords: ["relatorios", "relatorio", "estatisticas", "metricas", "desempenho", "graficos", "grafico", "balanco", "resultados", "kpi"]
      },
      {
        id: "horarios",
        title: "Horários de Funcionamento",
        subtitle: "Expediente, pausas e folgas",
        icon: Clock,
        route: `${basePath}/horarios`,
        keywords: ["horarios", "expediente", "dias", "abertura", "fechamento", "folga", "pausa", "intervalo", "excepcional", "turnos"]
      },
      {
        id: "barbeiros",
        title: "Equipe de Barbeiros",
        subtitle: "Profissionais e colaboradores",
        icon: Users,
        route: isBarber ? "/barber/dados" : "/admin/barbeiros",
        keywords: ["barbeiros", "barbeiro", "equipe", "profissionais", "colaboradores", "funcionarios", "time"]
      },
      {
        id: "avaliacoes",
        title: "Avaliações",
        subtitle: "Notas e comentários de clientes",
        icon: Star,
        route: isBarber ? "/barber/agenda" : "/admin/avaliacoes",
        keywords: ["avaliacoes", "avaliacao", "feedbacks", "feedback", "notas", "estrelas", "opiniao", "reputacao"]
      },
      {
        id: "loja",
        title: "Produtos e Loja",
        subtitle: "Estoque e produtos de barbearia",
        icon: ShoppingBag,
        route: isBarber ? `${basePath}/agenda` : "/admin/loja",
        keywords: ["loja", "produtos", "produto", "pomada", "oleo", "shampoo", "estoque", "vendas"]
      },
      {
        id: "configuracoes",
        title: "Configurações da Barbearia",
        subtitle: "Dados gerais, endereço e empresa",
        icon: Settings,
        route: isBarber ? "/barber/dados" : "/admin/configuracoes",
        keywords: ["configuracoes", "configuracao", "barbearia", "empresa", "ajustes", "dados", "endereco", "logo", "perfil"]
      },
      {
        id: "seguranca",
        title: "Segurança",
        subtitle: "PIN de acesso e privacidade",
        icon: Shield,
        route: `${basePath}/seguranca`,
        keywords: ["seguranca", "pin", "senha", "privacidade", "protecao", "autenticacao"]
      },
      {
        id: "suporte",
        title: "Suporte",
        subtitle: "Falar com atendimento DUB",
        icon: Headset,
        route: "",
        externalUrl: "https://wa.me/5511963390043?text=" + encodeURIComponent("Olá! Preciso de suporte no app DUB 🙏"),
        keywords: ["suporte", "ajuda", "duvidas", "problema", "socorro", "atendimento", "chamado", "whatsapp suporte"]
      }
    ];
  }, [basePath]);

  const filteredModules = useMemo(() => {
    if (!query.trim()) return [];
    return appModules.filter((mod) => matchesSearch(query, mod.title, mod.keywords));
  }, [query, appModules]);

  const filteredClients = useMemo(() => {
    if (!query.trim()) return [];
    const q = normalizeText(query);
    return clients.filter((c) => {
      const matchName = normalizeText(c.nome).includes(q) || levenshteinDistance(q, normalizeText(c.nome)) <= 2;
      const matchPhone = c.telefone ? c.telefone.includes(q) : false;
      return matchName || matchPhone;
    });
  }, [query, clients]);

  const filteredServices = useMemo(() => {
    if (!query.trim()) return [];
    const q = normalizeText(query);
    return services.filter((s) => {
      return normalizeText(s.nome).includes(q) || levenshteinDistance(q, normalizeText(s.nome)) <= 2;
    });
  }, [query, services]);

  const handleSelect = (item: SearchModuleItem) => {
    onOpenChange(false);
    if (item.externalUrl) {
      window.open(item.externalUrl, "_blank", "noopener,noreferrer");
    } else {
      navigate(item.route);
    }
  };

  const handleSelectClient = () => {
    onOpenChange(false);
    navigate(`${basePath}/clientes`);
  };

  const handleSelectService = () => {
    onOpenChange(false);
    navigate(basePath === "/barber" ? "/barber/cortes" : "/admin/servicos/cortes");
  };

  if (!open) return null;

  const totalResults = filteredModules.length + filteredClients.length + filteredServices.length;

  // Render via createPortal diretamente em document.body para garantir 100% tela cheia
  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[999999] bg-background w-full flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] select-none"
        style={{
          height: "var(--kb-viewport-height, 100dvh)",
          maxHeight: "var(--kb-viewport-height, 100dvh)",
        }}
      >
        {/* ═══ BARRA DE BUSCA — 100% IDÊNTICA À TELA INICIAL (SEM CAIXA NA SETA, MESMA ALTURA E ESTILO) ═══ */}
        <div className="px-4 py-3 bg-background flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1 -ml-1 text-foreground/80 hover:text-foreground shrink-0 active:scale-90 transition-transform"
            aria-label="Voltar"
          >
            <ChevronLeft className="w-6 h-6 stroke-[2.2]" />
          </button>

          <div className="relative flex-1 flex items-center">
            <Search className="absolute left-4 w-5 h-5 text-muted-foreground/70 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Buscar em todo o app (clientes, cortes, financeiro...)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-[54px] pl-12 pr-11 rounded-full bg-card border border-border/80 text-[14px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-foreground/40 shadow-sm transition-all"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3.5 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-all"
                aria-label="Limpar texto"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* ═══ LISTA MINIMALISTA E SÉRIA (SEM CAIXAS DE ÍCONE OU COISAS DE IA) ═══ */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-6 pb-16">
          {query.trim() === "" ? (
            /* Estado Inicial Minimalista */
            <div className="space-y-2">
              <p className="text-[11px] font-medium tracking-wider text-muted-foreground/50 uppercase px-2">
                Acesso Rápido
              </p>
              <div className="divide-y divide-border/20">
                {appModules.slice(0, 8).map((mod) => {
                  const Icon = mod.icon;
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => handleSelect(mod)}
                      className="w-full py-3 px-2 flex items-center justify-between hover:bg-secondary/30 active:bg-secondary/50 rounded-lg transition-colors text-left group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon className="w-4 h-4 text-muted-foreground/70 group-hover:text-foreground shrink-0 transition-colors" />
                        <span className="text-[14px] font-normal text-foreground truncate">
                          {mod.title}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : totalResults > 0 ? (
            /* Resultados de Busca Minimalistas */
            <div className="space-y-5">
              {/* Módulos */}
              {filteredModules.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium tracking-wider text-muted-foreground/50 uppercase px-2">
                    Módulos
                  </p>
                  <div className="divide-y divide-border/20">
                    {filteredModules.map((mod) => {
                      const Icon = mod.icon;
                      return (
                        <button
                          key={mod.id}
                          type="button"
                          onClick={() => handleSelect(mod)}
                          className="w-full py-3 px-2 flex items-center justify-between hover:bg-secondary/30 active:bg-secondary/50 rounded-lg transition-colors text-left group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Icon className="w-4 h-4 text-muted-foreground/70 group-hover:text-foreground shrink-0 transition-colors" />
                            <div className="min-w-0">
                              <p className="text-[14px] font-normal text-foreground truncate">
                                {mod.title}
                              </p>
                              {mod.subtitle && (
                                <p className="text-[12px] text-muted-foreground/50 truncate">
                                  {mod.subtitle}
                                </p>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Clientes */}
              {filteredClients.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium tracking-wider text-muted-foreground/50 uppercase px-2">
                    Clientes
                  </p>
                  <div className="divide-y divide-border/20">
                    {filteredClients.slice(0, 10).map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={handleSelectClient}
                        className="w-full py-3 px-2 flex items-center justify-between hover:bg-secondary/30 active:bg-secondary/50 rounded-lg transition-colors text-left group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <User className="w-4 h-4 text-muted-foreground/70 group-hover:text-foreground shrink-0 transition-colors" />
                          <div className="min-w-0">
                            <p className="text-[14px] font-normal text-foreground truncate">
                              {client.nome}
                            </p>
                            {client.telefone && (
                              <p className="text-[12px] text-muted-foreground/50 truncate tabular-nums">
                                {client.telefone}
                              </p>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Serviços */}
              {filteredServices.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium tracking-wider text-muted-foreground/50 uppercase px-2">
                    Serviços
                  </p>
                  <div className="divide-y divide-border/20">
                    {filteredServices.slice(0, 10).map((serv) => (
                      <button
                        key={serv.id}
                        type="button"
                        onClick={handleSelectService}
                        className="w-full py-3 px-2 flex items-center justify-between hover:bg-secondary/30 active:bg-secondary/50 rounded-lg transition-colors text-left group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Scissors className="w-4 h-4 text-muted-foreground/70 group-hover:text-foreground shrink-0 transition-colors" />
                          <div className="min-w-0">
                            <p className="text-[14px] font-normal text-foreground truncate">
                              {serv.nome}
                            </p>
                            <p className="text-[12px] text-muted-foreground/50 truncate">
                              {serv.duracao_minutos} min
                            </p>
                          </div>
                        </div>
                        <span className="text-[13px] font-medium text-foreground/80 tabular-nums shrink-0">
                          R$ {serv.preco.toFixed(0)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Sem resultados — silencioso e limpo */
            <div className="py-16 text-center">
              <p className="text-[14px] text-muted-foreground/60">
                Nenhum resultado encontrado
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
