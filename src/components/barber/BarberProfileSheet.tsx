import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Camera, Lock, Mail, Phone, Loader2, Shield, CheckCircle2, Trash2, User, Eye, EyeOff
} from "lucide-react";
import { BarberContext } from "@/pages/Barbeiro";
import { motion } from "framer-motion";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIMES } from "@/lib/queryConstants";
import { useSaveBarberProfile, useUploadBarberPhoto, useRemoveBarberPhoto } from "@/hooks/useBarberMutations";

interface BarberProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barberContext: BarberContext;
}

/** Busca dados do perfil do barbeiro */
async function fetchBarberProfile(barbeiroId: string) {
  const [barbeiroRes, privadoRes] = await Promise.all([
    supabase.from("barbeiros").select("apelido, foto_url").eq("id", barbeiroId).single(),
    supabase.from("barbeiros_private").select("email, telefone").eq("barbeiro_id", barbeiroId).maybeSingle(),
  ]);

  let email = privadoRes.data?.email || "";
  if (!email) {
    const { data: { user } } = await supabase.auth.getUser();
    email = user?.email || "";
  }

  return {
    apelido: barbeiroRes.data?.apelido || "",
    fotoUrl: barbeiroRes.data?.foto_url || null,
    email,
    telefone: privadoRes.data?.telefone || "",
  };
}

export function BarberProfileSheet({ open, onOpenChange, barberContext }: BarberProfileSheetProps) {
  const queryClient = useQueryClient();
  const [changingPassword, setChangingPassword] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state local (sincronizado com query data)
  const [apelido, setApelido] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const profileQueryKey = QUERY_KEYS.barbeiro.perfil(barberContext.barbeiroId);

  const { isLoading: loading } = useQuery({
    queryKey: profileQueryKey,
    queryFn: () => fetchBarberProfile(barberContext.barbeiroId),
    staleTime: STALE_TIMES.PERFIL_BARBEIRO,
    enabled: open && !!barberContext.barbeiroId,
    // Sincroniza state local quando dados são carregados
    select: (data) => {
      // Atualiza form apenas quando query carrega dados frescos
      setTimeout(() => {
        setApelido(data.apelido);
        setEmail(data.email);
        setTelefone(data.telefone);
        setFotoUrl(data.fotoUrl);
      }, 0);
      return data;
    },
  });

  const invalidateProfile = () => {
    queryClient.invalidateQueries({ queryKey: profileQueryKey });
  };

  const saveProfileMutation = useSaveBarberProfile();
  const uploadPhotoMutation = useUploadBarberPhoto();
  const removePhotoMutation = useRemoveBarberPhoto();

  const handleSaveProfile = () => {
    if (!apelido.trim()) {
      toast.error("O nome/apelido é obrigatório");
      return;
    }
    saveProfileMutation.mutate({ barbeiroId: barberContext.barbeiroId, apelido, email, telefone });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione apenas imagens"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Máximo 5MB"); return; }

    uploadPhotoMutation.mutate(
      { barbeiroId: barberContext.barbeiroId, file },
      { onSuccess: (publicUrl) => setFotoUrl(publicUrl) }
    );
  };

  const handleRemovePhoto = () => {
    removePhotoMutation.mutate(
      { barbeiroId: barberContext.barbeiroId, currentFotoUrl: fotoUrl },
      {
        onSuccess: () => {
          setFotoUrl(null);
          setShowRemoveDialog(false);
        },
      }
    );
  };

  const saving = saveProfileMutation.isPending;
  const uploadingPhoto = uploadPhotoMutation.isPending;
  const removingPhoto = removePhotoMutation.isPending;

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) { toast.error("Preencha todos os campos"); return; }
    if (newPassword.length < 6) { toast.error("Mínimo 6 caracteres"); return; }
    if (newPassword !== confirmPassword) { toast.error("Senhas não coincidem"); return; }

    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Senha alterada com sucesso!");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast.error(error.message || "Erro ao alterar senha");
    } finally {
      setChangingPassword(false);
    }
  };

  const initials = apelido ? apelido.charAt(0).toUpperCase() : "B";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md bg-background border-border p-0 overflow-y-auto"
        >
          <SheetHeader className="p-6 pb-0">
            <SheetTitle className="text-foreground text-lg font-bold">Meu Perfil</SheetTitle>
          </SheetHeader>

          {loading ? (
            <div className="flex items-center justify-center p-16">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Avatar */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-3"
              >
                <div className="relative group">
                  <Avatar className="h-20 w-20 border-2 border-primary/30 shadow-[0_0_20px_rgba(255,59,59,0.2)]">
                    <AvatarImage src={fotoUrl || undefined} alt={apelido} className="object-cover" />
                    <AvatarFallback className="bg-primary/15 text-primary text-2xl font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="absolute inset-0 rounded-full bg-background/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  >
                    {uploadingPhoto ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto} className="gap-1.5 text-xs h-8">
                    {uploadingPhoto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                    {fotoUrl ? "Trocar foto" : "Adicionar foto"}
                  </Button>
                  {fotoUrl && (
                    <Button variant="ghost" size="sm" onClick={() => setShowRemoveDialog(true)} disabled={removingPhoto} className="gap-1.5 text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5" />
                      Remover
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground/60">JPG, PNG ou WebP — máx. 5 MB</p>
              </motion.div>

              {/* Info */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                className="space-y-3 rounded-xl border border-border/50 bg-secondary/30 p-4"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <User className="h-4 w-4 text-primary" />
                  Informações Pessoais
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Nome / Apelido</Label>
                    <Input value={apelido} onChange={(e) => setApelido(e.target.value)} placeholder="Seu nome" className="h-10 text-sm bg-background" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />E-mail</Label>
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="h-10 text-sm bg-background" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />Telefone</Label>
                      <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" className="h-10 text-sm bg-background" />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSaveProfile} disabled={saving} size="sm" className="gap-2 h-9 text-xs font-semibold rounded-lg">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {saving ? "Salvando..." : "Salvar alterações"}
                  </Button>
                </div>
              </motion.div>

              {/* Password */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16 }}
                className="space-y-3 rounded-xl border border-border/50 bg-secondary/30 p-4"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Shield className="h-4 w-4 text-primary" />
                  Segurança
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Nova senha</Label>
                    <div className="relative">
                      <Input type={showPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="h-10 text-sm pr-10 bg-background" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                        {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Confirmar nova senha</Label>
                    <div className="relative">
                      <Input type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repita a nova senha" className="h-10 text-sm pr-10 bg-background" />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                        {showConfirmPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleChangePassword} disabled={changingPassword} variant="outline" size="sm" className="gap-2 h-9 text-xs font-semibold rounded-lg">
                    {changingPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                    {changingPassword ? "Alterando..." : "Alterar senha"}
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Remove Photo Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover foto de perfil</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja remover sua foto?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemovePhoto} disabled={removingPhoto} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {removingPhoto ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}