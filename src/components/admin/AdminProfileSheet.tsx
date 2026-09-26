import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  User, Mail, Lock, Loader2, Eye, EyeOff, Shield, CheckCircle2, Camera, Trash2
} from "lucide-react";
import { motion } from "framer-motion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { resolveOwnerIdentity } from "@/lib/ownerIdentity";
import { readSyncCache, writeSyncCache } from "@/lib/syncQueryCache";

/** Cache local do perfil do admin — hidratação em 0ms (mesmo padrão do barbeiro) */
const ADMIN_PROFILE_CACHE = "admin-profile";
interface AdminProfileCache { userId: string; email: string; avatarUrl: string | null; name: string }

interface AdminProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminProfileSheet({ open, onOpenChange }: AdminProfileSheetProps) {
  const cachedProfile = readSyncCache<AdminProfileCache>(ADMIN_PROFILE_CACHE)?.data || null;
  const [loading, setLoading] = useState(!cachedProfile);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [userId, setUserId] = useState<string | null>(cachedProfile?.userId ?? null);
  const [email, setEmail] = useState(cachedProfile?.email ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(cachedProfile?.avatarUrl ?? null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileName, setProfileName] = useState(cachedProfile?.name ?? "");

  useEffect(() => {
    if (open) loadProfile();
  }, [open]);

  const loadProfile = async () => {
    // Com cache local, revalida em background sem bloquear a tela.
    if (!readSyncCache<AdminProfileCache>(ADMIN_PROFILE_CACHE)) setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        setEmail(user.email || "");

        // Carregar avatar do profiles
        const { data: profile } = await supabase
          .from("profiles")
          .select("avatar_url")
          .eq("id", user.id)
          .maybeSingle();

        setAvatarUrl(profile?.avatar_url || null);
        const identity = await resolveOwnerIdentity(user.id);
        setProfileName(identity.displayName);
        writeSyncCache<AdminProfileCache>(ADMIN_PROFILE_CACHE, {
          userId: user.id,
          email: user.email || "",
          avatarUrl: profile?.avatar_url || null,
          name: identity.displayName,
        });
      }
    } catch (error) {
      console.error("Erro ao carregar perfil:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione apenas arquivos de imagem");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB");
      return;
    }

    setUploadingPhoto(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `admin-${userId}-${Date.now()}.${fileExt}`;
      const filePath = `admins/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      writeSyncCache<AdminProfileCache>(ADMIN_PROFILE_CACHE, { userId: userId!, email, avatarUrl: publicUrl, name: profileName });
      toast.success("Foto atualizada com sucesso!");
    } catch (error: any) {
      console.error("Erro ao fazer upload:", error);
      toast.error(error.message || "Erro ao atualizar foto");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!userId) return;
    setRemovingPhoto(true);
    try {
      // Remove do storage
      if (avatarUrl) {
        const urlParts = avatarUrl.split("/avatars/");
        if (urlParts.length > 1) {
          await supabase.storage.from("avatars").remove([urlParts[1]]);
        }
      }

      // Limpa no perfil
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", userId);

      if (error) throw error;

      setAvatarUrl(null);
      writeSyncCache<AdminProfileCache>(ADMIN_PROFILE_CACHE, { userId: userId!, email, avatarUrl: null, name: profileName });
      setShowRemoveDialog(false);
      toast.success("Foto removida com sucesso");
    } catch (error: any) {
      console.error("Erro ao remover foto:", error);
      toast.error(error.message || "Erro ao remover foto");
    } finally {
      setRemovingPhoto(false);
    }
  };

  const handleSaveEmail = async () => {
    if (!email.trim()) {
      toast.error("E-mail é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: email.trim() });
      if (error) throw error;
      toast.success("E-mail atualizado! Verifique sua caixa de entrada.");
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar e-mail");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error("Preencha todos os campos de senha");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

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

  const initials = email ? email.charAt(0).toUpperCase() : "A";
  const hasPhoto = !!avatarUrl;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md bg-background border-border p-0 overflow-y-auto"
        >
          <SheetHeader className="p-6 pb-0">
            <SheetTitle className="text-foreground text-lg font-bold">
              Meu Perfil
            </SheetTitle>
          </SheetHeader>

          {loading ? (
            <div className="flex items-center justify-center p-16">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Avatar Section com Upload */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center gap-3"
              >
                <div className="relative group">
                  <Avatar className="h-20 w-20 border-2 border-primary/30 shadow-[0_0_20px_rgba(255,59,59,0.2)]">
                    <AvatarImage src={avatarUrl || undefined} alt="Admin" className="object-cover" />
                    <AvatarFallback className="bg-primary/15 text-primary text-2xl font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  {/* Overlay de upload */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="absolute inset-0 rounded-full bg-background/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
                    aria-label="Alterar foto de perfil"
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="h-5 w-5 text-foreground animate-spin" />
                    ) : (
                      <Camera className="h-5 w-5 text-foreground" />
                    )}
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </div>

                {/* Botões de ação da foto */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="gap-1.5 text-xs h-8 px-3 rounded-lg"
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Camera className="h-3.5 w-3.5" />
                    )}
                    {hasPhoto ? "Trocar foto" : "Adicionar foto"}
                  </Button>

                  {hasPhoto && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowRemoveDialog(true)}
                      disabled={removingPhoto}
                      className="gap-1.5 text-xs h-8 px-3 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      {removingPhoto ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Remover
                    </Button>
                  )}
                </div>

                <p className="text-[11px] text-muted-foreground/60 text-center">
                  JPG, PNG ou WebP — máx. 5 MB
                </p>

                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">{profileName || "Administrador"}</p>
                </div>
              </motion.div>

              {/* Email Section */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.08 }}
                className="space-y-3 rounded-xl border border-border/50 bg-secondary/30 p-4"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <User className="h-4 w-4 text-primary" />
                  Informações da Conta
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Mail className="h-3 w-3" />
                    E-mail
                  </Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="h-10 text-sm bg-background"
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveEmail}
                    disabled={saving}
                    size="sm"
                    className="gap-2 h-9 text-xs font-semibold rounded-lg"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    {saving ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </motion.div>

              {/* Password Section */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.16 }}
                className="space-y-3 rounded-xl border border-border/50 bg-secondary/30 p-4"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Shield className="h-4 w-4 text-primary" />
                  Segurança
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Nova senha</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="h-10 text-sm pr-10 bg-background"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Confirmar nova senha</Label>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repita a nova senha"
                        className="h-10 text-sm pr-10 bg-background"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleChangePassword}
                    disabled={changingPassword}
                    variant="outline"
                    size="sm"
                    className="gap-2 h-9 text-xs font-semibold rounded-lg"
                  >
                    {changingPassword ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Lock className="h-3.5 w-3.5" />
                    )}
                    {changingPassword ? "Alterando..." : "Alterar senha"}
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Dialog de confirmação para remover foto */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover foto de perfil</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover sua foto de perfil?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemovePhoto}
              disabled={removingPhoto}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removingPhoto ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
