import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Camera,
  Loader2,
  ChevronRight,
  Phone,
  MapPin,
  Globe,
} from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { buildDadosEmpresaSearch } from "./unitSelection";
import { useDadosEmpresaUnits } from "./useDadosEmpresaUnits";

interface Props {
  basePath?: string;
  tenantId?: string | null;
  selectedUnidadeId?: string | null;
}

interface NavCard {
  icon: typeof Building2;
  title: string;
  description: string;
  path: string;
}

/**
 * Hub de Dados da Barbearia — logo + cards de navegação para cada seção.
 */
export function DadosEmpresaHub({ basePath = "/admin", tenantId, selectedUnidadeId }: Props) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const { units, loading: loadingUnits, defaultUnit } = useDadosEmpresaUnits(tenantId);

  const currentUnit = useMemo(
    () => units.find((unit) => unit.id === selectedUnidadeId) ?? defaultUnit,
    [defaultUnit, selectedUnidadeId, units],
  );

  const unidadeSearch = buildDadosEmpresaSearch(currentUnit?.id ?? selectedUnidadeId ?? null);

  /** Cards separados por categoria */
  const allCards: NavCard[] = [
    {
      icon: Building2,
      title: "Identificação",
      description: "Nome, slogan, CNPJ e CPF do responsável",
      path: `${basePath}/dados-empresa/identificacao${unidadeSearch}`,
    },
    {
      icon: Phone,
      title: "Contato",
      description: "E-mail, telefone e WhatsApp",
      path: `${basePath}/dados-empresa/contato${unidadeSearch}`,
    },
    {
      icon: MapPin,
      title: "Endereço",
      description: "Rua, bairro, cidade e estado",
      path: `${basePath}/dados-empresa/endereco${unidadeSearch}`,
    },
    {
      icon: Globe,
      title: "Presença Online",
      description: "Website e redes sociais",
      path: `${basePath}/dados-empresa/online${unidadeSearch}`,
    },
  ];

  // Carregar logo
  useEffect(() => {
    const loadData = async () => {
      try {
        if (tenantId) {
          const { data } = await supabase
            .from("tenants")
            .select("logo_url")
            .eq("id", tenantId)
            .maybeSingle();
          if (data?.logo_url) setLogoUrl(data.logo_url);
        } else {
          const { data } = await supabase
            .from("informacoes_empresa")
            .select("valor")
            .eq("chave", "logo_url")
            .eq("categoria", "empresa")
            .is("tenant_id", null)
            .maybeSingle();
          if (data?.valor) setLogoUrl(data.valor);
        }
      } catch (err) {
        console.error("Erro ao carregar logo:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [tenantId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione apenas imagens");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Máximo 5MB");
      return;
    }
    uploadLogo(file);
    e.target.value = "";
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const fileName = `logo-${tenantId || "global"}-${Date.now()}.${ext}`;
      const filePath = `${tenantId || "global"}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("logos")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      if (tenantId) {
        await supabase
          .from("tenants")
          .update({ logo_url: publicUrl })
          .eq("id", tenantId);
      } else {
        const { data: existing } = await supabase
          .from("informacoes_empresa")
          .select("id")
          .eq("chave", "logo_url")
          .eq("categoria", "empresa")
          .is("tenant_id", null)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("informacoes_empresa")
            .update({ valor: publicUrl, atualizado_em: new Date().toISOString() } as any)
            .eq("id", existing.id);
        } else {
          await supabase
            .from("informacoes_empresa")
            .insert({
              chave: "logo_url",
              categoria: "empresa",
              valor: publicUrl,
              ativo: true,
              atualizado_em: new Date().toISOString(),
            } as any);
        }
      }

      setLogoUrl(publicUrl);
      toast.success("Logo atualizada com sucesso!");
    } catch (err) {
      console.error("Erro ao enviar logo:", err);
      toast.error("Erro ao enviar logo");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="pb-20 -mx-3 -mt-3">
      {/* ── Header ── */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/30">
        <div className="flex items-center gap-2.5 px-4 h-14">
          <button
            onClick={() => navigate(`${basePath}/configuracoes-perfil`)}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 active:scale-95 transition-all"
            aria-label="Voltar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-foreground">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10a4 4 0 0 1 4 4v1" />
            </svg>
          </button>
          <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1">
            Dados da Barbearia
          </h1>
        </div>
      </div>

      <div className="px-4 pt-6 space-y-6">
        {/* ═══ LOGO DA BARBEARIA ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col items-center gap-3"
        >
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="relative group"
            aria-label="Alterar logo"
          >
            <div className={cn(
              "w-24 h-24 rounded-2xl border-2 border-border/30 bg-card shadow-md overflow-hidden",
              "flex items-center justify-center",
              "group-hover:shadow-lg transition-shadow"
            )}>
              {uploading ? (
                <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
              ) : logoUrl ? (
                <img src={logoUrl} alt="Logo da barbearia" className="w-full h-full object-cover" />
              ) : (
                <Building2 className="h-8 w-8 text-muted-foreground/30" />
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary flex items-center justify-center border-2 border-background shadow-sm group-hover:scale-110 transition-transform">
              <Camera className="h-3 w-3 text-primary-foreground" />
            </div>
          </button>
          <div className="text-center">
            <p className="text-[13px] font-medium text-foreground">Logo da Barbearia</p>
            <p className="text-[11px] text-muted-foreground/50">Toque para alterar</p>
          </div>
        </motion.div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* ═══ CARDS DE NAVEGAÇÃO ═══ */}
        <div className="space-y-2.5">
          {allCards.map((card, index) => (
            <motion.button
              key={card.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.05 * (index + 1) }}
              onClick={() => navigate(card.path)}
              className={cn(
                "w-full flex items-center gap-3.5 px-4 py-3.5",
                "rounded-2xl bg-card border border-border/20",
                "hover:bg-secondary/30 active:scale-[0.98]",
                "transition-all duration-200 text-left"
              )}
            >
              <div className="w-10 h-10 rounded-xl bg-secondary/50 flex items-center justify-center shrink-0">
                <card.icon className="w-[18px] h-[18px] text-foreground/70" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-foreground">{card.title}</p>
                <p className="text-[12px] text-muted-foreground/50 leading-snug">{card.description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
