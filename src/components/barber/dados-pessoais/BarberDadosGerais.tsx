import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useBarberDados } from "./useBarberDados";
import { CompactField } from "@/components/admin/dados-empresa/CompactField";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";
import { Loader2, Save, Camera, AlertCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarEditSheet } from "@/components/admin/mobile/AvatarEditSheet";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useCepLookup } from "@/hooks/useCepLookup";

interface Props {
  barbeiroId?: string | null;
  userId?: string | null;
  basePath?: string;
  onBack?: () => void;
}

const maskCpf = (val: string) => {
  const d = val.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

const maskCep = (val: string) => {
  const d = val.replace(/\D/g, "").slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, "$1-$2");
};

const maskPhone = (val: string) => {
  const d = val.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return d
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
};

/**
 * Tela unificada: Dados Gerais do barbeiro/titular.
 * Padrão 100% executivo, minimalista e sério (Apple/Linear/Raycast).
 */
export function BarberDadosGerais({ barbeiroId, userId, basePath = "/barbeiro", onBack }: Props) {
  const navigate = useNavigate();
  const {
    data,
    loading,
    isError,
    refetch,
    saving,
    hasChanges,
    update,
    saveData,
    resolvedBarbeiroId,
    resolvedUserId,
  } = useBarberDados(barbeiroId, userId);

  const { fetchCep, loadingCep } = useCepLookup();

  // ── Avatar state ──
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarEditOpen, setAvatarEditOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carrega avatar a partir do perfil ou barbeiro
  useEffect(() => {
    let mounted = true;
    const loadAvatar = async () => {
      const activeUserId = resolvedUserId || userId;
      const activeBarberId = resolvedBarbeiroId || barbeiroId;

      if (activeUserId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("avatar_url")
          .eq("id", activeUserId)
          .maybeSingle();

        if (mounted && profile?.avatar_url) {
          setAvatarUrl(profile.avatar_url);
          return;
        }
      }

      if (activeBarberId) {
        const { data: barber } = await supabase
          .from("barbeiros")
          .select("foto_url")
          .eq("id", activeBarberId)
          .maybeSingle();

        if (mounted && barber?.foto_url) {
          setAvatarUrl(barber.foto_url);
        }
      }
    };

    loadAvatar();
    return () => {
      mounted = false;
    };
  }, [resolvedUserId, resolvedBarbeiroId, userId, barbeiroId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    setSelectedFile(file);
    setAvatarEditOpen(true);
    e.target.value = "";
  };

  /** Busca automática de endereço pelo CEP */
  const handleCepBlur = useCallback(async () => {
    const rawCep = data.endereco_cep.replace(/\D/g, "");
    if (!rawCep || rawCep.length !== 8) return;
    const result = await fetchCep(rawCep);
    if (result) {
      if (result.logradouro) update("endereco_rua", result.logradouro);
      if (result.bairro) update("endereco_bairro", result.bairro);
      if (result.localidade) update("endereco_cidade", result.localidade);
      if (result.uf) update("endereco_estado", result.uf);
      toast.success("Endereço preenchido automaticamente");
    }
  }, [data.endereco_cep, fetchCep, update]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(basePath);
    }
  };

  const initials = data.nome_completo
    ? data.nome_completo.charAt(0).toUpperCase()
    : "B";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-4 text-center">
        <AlertCircle className="w-10 h-10 text-amber-500/80" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">Não foi possível carregar os dados pessoais.</p>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="pb-32 min-h-app bg-background">
        {/* ── Header Padrão do Sistema ── */}
        <ScheduleHeader
          title="Meus Dados Pessoais"
          onBack={handleBack}
        />

        <div className="px-4 pt-4 max-w-md mx-auto space-y-5">
          {/* ═══ FOTO DE PERFIL ═══ */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center gap-2 py-1"
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative group cursor-pointer"
              aria-label="Alterar foto de perfil"
            >
              <Avatar className="h-20 w-20 border-2 border-border/40 shadow-xs group-hover:opacity-90 transition-opacity">
                <AvatarImage src={avatarUrl || undefined} alt="Foto" className="object-cover" />
                <AvatarFallback className="bg-secondary text-foreground text-xl font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center border-2 border-background shadow-xs group-hover:scale-105 transition-transform">
                <Camera className="h-3.5 w-3.5" />
              </div>
            </button>
            <p className="text-[11.5px] text-muted-foreground/60 font-medium">Toque para alterar a foto</p>
          </motion.div>

          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

          {/* ═══ IDENTIFICAÇÃO ═══ */}
          <FormSection index={1} title="Identificação">
            <CompactField
              label="Nome Completo"
              value={data.nome_completo}
              onChange={(v) => update("nome_completo", v)}
              placeholder="Ex: Carlos Eduardo Silva"
              required
            />
            <CompactField
              label="CPF"
              value={data.cpf}
              onChange={(v) => update("cpf", maskCpf(v))}
              placeholder="000.000.000-00"
              required
              hint="Necessário para assinaturas, identificação e repasses"
            />
            <CompactField
              label="Data de Nascimento"
              value={data.data_nascimento}
              onChange={(v) => update("data_nascimento", v)}
              type="date"
            />
          </FormSection>

          {/* ═══ CONTATO ═══ */}
          <FormSection index={2} title="Contato">
            <CompactField
              label="E-mail"
              value={data.email}
              onChange={(v) => update("email", v)}
              type="email"
              placeholder="seuemail@exemplo.com"
              required
              hint="Usado para notificações do sistema"
            />
            <CompactField
              label="Telefone / WhatsApp"
              value={data.telefone}
              onChange={(v) => update("telefone", maskPhone(v))}
              placeholder="(11) 90000-0000"
              required
            />
          </FormSection>

          {/* ═══ ENDEREÇO PESSOAL ═══ */}
          <FormSection index={3} title="Endereço Pessoal">
            <div onBlur={handleCepBlur}>
              <CompactField
                label="CEP"
                value={data.endereco_cep}
                onChange={(v) => update("endereco_cep", maskCep(v))}
                placeholder="00000-000"
                loading={loadingCep}
                hint="Digite o CEP para autocompletar o endereço"
              />
            </div>
            <div className="grid grid-cols-4 gap-2.5">
              <div className="col-span-3">
                <CompactField
                  label="Rua"
                  value={data.endereco_rua}
                  onChange={(v) => update("endereco_rua", v)}
                  placeholder="Rua / Avenida"
                />
              </div>
              <CompactField
                label="Nº"
                value={data.endereco_numero}
                onChange={(v) => update("endereco_numero", v)}
                placeholder="123"
              />
            </div>
            <CompactField
              label="Bairro"
              value={data.endereco_bairro}
              onChange={(v) => update("endereco_bairro", v)}
              placeholder="Bairro"
            />
            <div className="grid grid-cols-4 gap-2.5">
              <div className="col-span-3">
                <CompactField
                  label="Cidade"
                  value={data.endereco_cidade}
                  onChange={(v) => update("endereco_cidade", v)}
                  placeholder="Cidade"
                />
              </div>
              <CompactField
                label="UF"
                value={data.endereco_estado}
                onChange={(v) => update("endereco_estado", v.toUpperCase().slice(0, 2))}
                placeholder="SP"
              />
            </div>
          </FormSection>
        </div>

        {/* ── Botão Salvar fixo com container alinhado ── */}
        <div
          className="fixed bottom-4 left-0 right-0 px-4 z-40 pointer-events-none"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="max-w-md mx-auto w-full pointer-events-auto">
            <button
              type="button"
              onClick={() => saveData(data)}
              disabled={saving || !hasChanges}
              className={cn(
                "w-full h-12 rounded-2xl text-[13.5px] font-semibold tracking-wide flex items-center justify-center gap-2",
                "bg-foreground text-background",
                "active:scale-[0.98] transition-all duration-200",
                "shadow-lg shadow-black/10 dark:shadow-black/40",
                hasChanges && !saving
                  ? "opacity-100 hover:opacity-90 cursor-pointer"
                  : "opacity-35 pointer-events-none"
              )}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>Salvar alterações</span>
            </button>
          </div>
        </div>
      </div>

      {(resolvedUserId || userId) && (
        <AvatarEditSheet
          open={avatarEditOpen}
          onOpenChange={setAvatarEditOpen}
          userId={(resolvedUserId || userId)!}
          initials={initials}
          storagePath="barbeiros"
          selectedFile={selectedFile}
          onAvatarUpdated={(url) => {
            setAvatarUrl(url);
            setSelectedFile(null);
          }}
        />
      )}
    </>
  );
}

function FormSection({ title, children, index }: { title: string; children: React.ReactNode; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.04 * index }}
      className="space-y-3"
    >
      <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground/70 px-1">
        {title}
      </p>
      <div className="space-y-3.5 rounded-2xl bg-card border border-border/40 p-4 shadow-xs">
        {children}
      </div>
    </motion.div>
  );
}
