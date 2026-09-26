import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useBarberDados } from "./useBarberDados";
import { CompactField } from "@/components/admin/dados-empresa/CompactField";
import { Loader2, Save, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarEditSheet } from "@/components/admin/mobile/AvatarEditSheet";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useCepLookup } from "@/hooks/useCepLookup";

interface Props {
  barbeiroId: string;
  userId?: string;
  basePath?: string;
}

/**
 * Tela unificada: Dados Gerais do barbeiro.
 * Design premium com seções limpas, busca automática de CEP
 * e visual refinado sem poluição.
 */
export function BarberDadosGerais({ barbeiroId, userId, basePath = "/barbeiro" }: Props) {
  const navigate = useNavigate();
  const { data, loading, saving, hasChanges, update, saveData } = useBarberDados(barbeiroId);
  const { fetchCep, loadingCep } = useCepLookup();

  // ── Avatar state ──
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarEditOpen, setAvatarEditOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(userId || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (userId) { setResolvedUserId(userId); return; }
    let mounted = true;
    const resolve = async () => {
      const { data: barber } = await supabase
        .from("barbeiros")
        .select("user_id, foto_url")
        .eq("id", barbeiroId)
        .maybeSingle();
      if (!mounted) return;
      if (barber?.user_id) setResolvedUserId(barber.user_id);
      if (barber?.foto_url) setAvatarUrl(barber.foto_url);
    };
    resolve();
    return () => { mounted = false; };
  }, [barbeiroId, userId]);

  useEffect(() => {
    if (!resolvedUserId) return;
    let mounted = true;
    const loadAvatar = async () => {
      const { data: profile } = await supabase
        .from("profiles").select("avatar_url").eq("id", resolvedUserId).maybeSingle();
      if (!mounted) return;
      if (profile?.avatar_url) setAvatarUrl(profile.avatar_url);
      else {
        const { data: barber } = await supabase
          .from("barbeiros").select("foto_url").eq("id", barbeiroId).maybeSingle();
        if (mounted && barber?.foto_url) setAvatarUrl(barber.foto_url);
      }
    };
    loadAvatar();
    return () => { mounted = false; };
  }, [resolvedUserId, barbeiroId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione apenas imagens"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Máximo 5MB"); return; }
    setSelectedFile(file);
    setAvatarEditOpen(true);
    e.target.value = "";
  };

  /** Busca automática de endereço pelo CEP */
  const handleCepBlur = useCallback(async () => {
    const cep = data.endereco_cep;
    if (!cep || cep.replace(/\D/g, "").length !== 8) return;
    const result = await fetchCep(cep);
    if (result) {
      update("endereco_rua", result.logradouro || "");
      update("endereco_bairro", result.bairro || "");
      update("endereco_cidade", result.localidade || "");
      update("endereco_estado", result.uf || "");
      toast.success("Endereço preenchido automaticamente");
    }
  }, [data.endereco_cep, fetchCep, update]);

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

  return (
    <>
      <div className="pb-28 -mx-3 -mt-3">
        {/* ── Header fixo ── */}
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
            <h1 className="text-[19px] font-medium tracking-tight text-foreground flex-1">Dados Gerais</h1>
          </div>
        </div>

        <div className="px-4 pt-5 space-y-6">

          {/* ═══ FOTO DE PERFIL ═══ */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center gap-3 py-2"
          >
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative group"
              aria-label="Alterar foto"
            >
              <Avatar className="h-20 w-20 border-2 border-border/30 shadow-md group-hover:shadow-lg transition-shadow">
                <AvatarImage src={avatarUrl || undefined} alt="Foto" className="object-cover" />
                <AvatarFallback className="bg-secondary text-foreground text-xl font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary flex items-center justify-center border-2 border-background shadow-sm group-hover:scale-110 transition-transform">
                <Camera className="h-3 w-3 text-primary-foreground" />
              </div>
            </button>
            <p className="text-[11px] text-muted-foreground/50">Toque para alterar</p>
          </motion.div>

          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

          {/* ═══ IDENTIFICAÇÃO ═══ */}
          <FormSection index={1} title="Identificação">
            <CompactField label="Nome Completo" value={data.nome_completo} onChange={(v) => update("nome_completo", v)} required />
            <CompactField label="CPF" value={data.cpf} onChange={(v) => update("cpf", v)} placeholder="000.000.000-00" required hint="Necessário para configuração financeira" />
            <CompactField label="Data de Nascimento" value={data.data_nascimento} onChange={(v) => update("data_nascimento", v)} type="date" />
          </FormSection>

          {/* ═══ CONTATO ═══ */}
          <FormSection index={2} title="Contato">
            <CompactField label="E-mail" value={data.email} onChange={(v) => update("email", v)} type="email" required hint="Usado para login e notificações" />
            <CompactField label="Telefone / WhatsApp" value={data.telefone} onChange={(v) => update("telefone", v)} placeholder="(00) 00000-0000" required />
          </FormSection>

          {/* ═══ ENDEREÇO ═══ */}
          <FormSection index={3} title="Endereço">
            <div onBlur={handleCepBlur}>
              <CompactField
                label="CEP"
                value={data.endereco_cep}
                onChange={(v) => update("endereco_cep", v)}
                placeholder="00000-000"
                loading={loadingCep}
                hint="Digite o CEP para preencher automaticamente"
              />
            </div>
            <div className="grid grid-cols-4 gap-2.5">
              <div className="col-span-3">
                <CompactField label="Rua" value={data.endereco_rua} onChange={(v) => update("endereco_rua", v)} />
              </div>
              <CompactField label="Nº" value={data.endereco_numero} onChange={(v) => update("endereco_numero", v)} />
            </div>
            <CompactField label="Bairro" value={data.endereco_bairro} onChange={(v) => update("endereco_bairro", v)} />
            <div className="grid grid-cols-4 gap-2.5">
              <div className="col-span-3">
                <CompactField label="Cidade" value={data.endereco_cidade} onChange={(v) => update("endereco_cidade", v)} required />
              </div>
              <CompactField label="UF" value={data.endereco_estado} onChange={(v) => update("endereco_estado", v)} placeholder="UF" required />
            </div>
          </FormSection>
        </div>

        {/* ── Botão Salvar fixo ── */}
        <div className="fixed bottom-4 left-0 right-0 px-5 z-30" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <button
            onClick={() => saveData(data)}
            disabled={saving || !hasChanges}
            className={cn(
              "w-full h-12 rounded-2xl text-[13px] font-semibold tracking-wide flex items-center justify-center gap-2",
              "bg-foreground text-background",
              "active:scale-[0.98] transition-all duration-300",
              "shadow-lg",
              hasChanges && !saving
                ? "opacity-100 hover:bg-foreground/90"
                : "opacity-30 pointer-events-none"
            )}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar alterações
          </button>
        </div>
      </div>

      {resolvedUserId && (
        <AvatarEditSheet
          open={avatarEditOpen}
          onOpenChange={setAvatarEditOpen}
          userId={resolvedUserId}
          initials={initials}
          storagePath="barbeiros"
          selectedFile={selectedFile}
          onAvatarUpdated={(url) => { setAvatarUrl(url); setSelectedFile(null); }}
        />
      )}
    </>
  );
}

/* ═══════════════════════════════════════ */
/*  Seção de formulário — visual limpo    */
/* ═══════════════════════════════════════ */

function FormSection({ title, children, index }: { title: string; children: React.ReactNode; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.05 * index }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60 mb-3 px-1">
        {title}
      </p>
      <div className="space-y-3 rounded-2xl bg-card border border-border/20 p-4">
        {children}
      </div>
    </motion.div>
  );
}
