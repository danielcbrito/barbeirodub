import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBarberDados } from "./useBarberDados";
import { CompactField } from "@/components/admin/dados-empresa/CompactField";
import { ScheduleHeader } from "@/components/shared/ScheduleHeader";
import { Loader2, Camera, AlertCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarEditSheet } from "@/components/admin/mobile/AvatarEditSheet";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

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

/**
 * Tela unificada: Dados Gerais do barbeiro/titular.
 * Padrão 100% executivo, minimalista e direto (Apple/Linear/Raycast).
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

        <div className="px-4 pt-4 w-full space-y-4">
          {/* ═══ FOTO DE PERFIL ═══ */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center gap-2 py-2"
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

          {/* ═══ CAMPOS DIRETOS NO FUNDO (SEM QUADRADOS BRANCOS ATRÁS) ═══ */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
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

            <CompactField
              label="E-mail"
              value={data.email}
              onChange={(v) => update("email", v)}
              type="email"
              placeholder="seuemail@exemplo.com"
              required
              hint="Usado para notificações do sistema"
            />
          </motion.div>
        </div>

        {/* ── Botão Salvar visível apenas quando houver alterações pendentes ── */}
        <AnimatePresence>
          {hasChanges && (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 18 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed bottom-4 left-0 right-0 px-4 z-40 pointer-events-none"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <div className="w-full pointer-events-auto">
                <button
                  type="button"
                  onClick={() => saveData(data)}
                  disabled={saving}
                  className={cn(
                    "w-full h-12 rounded-2xl text-[14px] font-semibold tracking-wide flex items-center justify-center gap-2",
                    "bg-foreground text-background",
                    "active:scale-[0.98] transition-all duration-200",
                    "shadow-lg shadow-black/10 dark:shadow-black/40 cursor-pointer",
                    saving && "opacity-80 pointer-events-none"
                  )}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Salvar alterações</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
