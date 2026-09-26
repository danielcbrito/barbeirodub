import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useSaveBarberProfile, useUploadBarberPhoto, useRemoveBarberPhoto } from '@/hooks/useBarberMutations';
import { Camera, Save, Lock, Mail, Phone, Loader2, Shield, CheckCircle2, Trash2, User, Eye, EyeOff } from 'lucide-react';
import { BarberContext } from '@/pages/Barbeiro';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { motion, AnimatePresence } from 'framer-motion';
import { PerfilSkeleton } from '@/components/ui/loading';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface BarberProfileProps {
  barberContext: BarberContext;
  basePath?: string;
  isTenantAdmin?: boolean;
}

export function BarberProfile({ barberContext, basePath = "/barbeiro", isTenantAdmin = false }: BarberProfileProps) {
  const [loading, setLoading] = useState(true);
  const [changingPassword, setChangingPassword] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveProfileMutation = useSaveBarberProfile();
  const uploadPhotoMutation = useUploadBarberPhoto();
  const removePhotoMutation = useRemoveBarberPhoto();

  const [apelido, setApelido] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    let mounted = true;
    const doLoad = async () => {
      try {
        const { data: barbeiro, error: barbeiroError } = await supabase
          .from('barbeiros')
          .select('apelido, foto_url')
          .eq('id', barberContext.barbeiroId)
          .single();
        if (!mounted) return;
        if (barbeiroError) throw barbeiroError;

        setApelido(barbeiro.apelido || '');
        setFotoUrl(barbeiro.foto_url);

        const { data: privado } = await supabase
          .from('barbeiros_private')
          .select('email, telefone')
          .eq('barbeiro_id', barberContext.barbeiroId)
          .maybeSingle();
        if (!mounted) return;

        if (privado) {
          setEmail(privado.email || '');
          setTelefone(privado.telefone || '');
        }

        if (!privado?.email) {
          const { data: { user } } = await supabase.auth.getUser();
          if (mounted && user?.email) setEmail(user.email);
        }
      } catch (error) {
        console.error('Erro ao carregar perfil:', error);
        if (mounted) toast.error('Erro ao carregar dados do perfil');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    doLoad();
    return () => { mounted = false; };
  }, [barberContext.barbeiroId]);

  const loadProfile = async () => {
    try {
      const { data: barbeiro, error: barbeiroError } = await supabase
        .from('barbeiros')
        .select('apelido, foto_url')
        .eq('id', barberContext.barbeiroId)
        .single();

      if (barbeiroError) throw barbeiroError;

      setApelido(barbeiro.apelido || '');
      setFotoUrl(barbeiro.foto_url);

      const { data: privado } = await supabase
        .from('barbeiros_private')
        .select('email, telefone')
        .eq('barbeiro_id', barberContext.barbeiroId)
        .maybeSingle();

      if (privado) {
        setEmail(privado.email || '');
        setTelefone(privado.telefone || '');
      }

      if (!privado?.email) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) setEmail(user.email);
      }
    } catch (error) {
      console.error('Erro ao carregar perfil:', error);
      toast.error('Erro ao carregar dados do perfil');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = () => {
    if (!apelido.trim()) {
      toast.error('O nome/apelido é obrigatório');
      return;
    }
    saveProfileMutation.mutate({ barbeiroId: barberContext.barbeiroId, apelido, email, telefone });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Selecione apenas arquivos de imagem'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('A imagem deve ter no máximo 5MB'); return; }

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
    if (!newPassword || !confirmPassword) {
      toast.error('Preencha todos os campos de senha');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast.success('Senha alterada com sucesso!');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Erro ao alterar senha:', error);
      toast.error(error.message || 'Erro ao alterar senha');
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return <PerfilSkeleton />;
  }

  const initials = apelido ? apelido.charAt(0).toUpperCase() : 'B';
  const hasPhoto = !!fotoUrl;

  return (
    <div className="w-full max-w-xl mx-auto space-y-5 px-4 pb-8 animate-fade-in">

      {/* Avatar Section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="glass-card p-6"
      >
        <div className="flex flex-col items-center gap-4">
          {/* Avatar with overlay */}
          <div className="relative group">
            <Avatar className="h-[88px] w-[88px] border-2 border-border ring-2 ring-background transition-all duration-300 group-hover:border-primary/40">
              <AvatarImage src={fotoUrl || undefined} alt={apelido} className="object-cover" />
              <AvatarFallback className="bg-muted text-foreground text-2xl font-semibold tracking-wide">
                {initials}
              </AvatarFallback>
            </Avatar>

            {/* Upload overlay */}
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

          {/* Name & email display */}
          <div className="text-center space-y-0.5">
            <p className="text-base font-semibold text-foreground tracking-wide leading-tight">
              {apelido || 'Barbeiro'}
            </p>
            <p className="text-xs text-muted-foreground">{email || 'E-mail não definido'}</p>
          </div>

          {/* Photo action buttons */}
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
              {hasPhoto ? 'Trocar foto' : 'Adicionar foto'}
            </Button>

            <AnimatePresence>
              {hasPhoto && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                >
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <p className="text-[11px] text-muted-foreground/60 text-center leading-relaxed">
            JPG, PNG ou WebP — máx. 5 MB
          </p>
        </div>
      </motion.div>

      {/* Personal Info */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08 }}
        className="glass-card p-5"
      >
        <SectionHeader
          icon={<User className="h-4 w-4 text-primary" />}
          title="Informações pessoais"
          subtitle="Dados de identificação e contato"
        />

        <div className="space-y-3.5 mt-4">
          <FieldGroup label="Nome / Apelido" icon={<User className="h-3 w-3" />}>
            <Input
              value={apelido}
              onChange={(e) => setApelido(e.target.value)}
              placeholder="Como você é conhecido"
              className="input-glass h-10 text-sm"
            />
          </FieldGroup>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FieldGroup label="E-mail" icon={<Mail className="h-3 w-3" />}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="input-glass h-10 text-sm"
              />
            </FieldGroup>

            <FieldGroup label="Telefone" icon={<Phone className="h-3 w-3" />}>
              <Input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(00) 00000-0000"
                className="input-glass h-10 text-sm"
              />
            </FieldGroup>
          </div>

          <div className="flex justify-end pt-1">
            <Button
              onClick={handleSaveProfile}
              disabled={saving}
              size="sm"
              className="gap-2 min-w-[130px] h-9 text-xs font-semibold tracking-wide rounded-lg"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Security */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.16 }}
        className="glass-card p-5"
      >
        <SectionHeader
          icon={<Shield className="h-4 w-4 text-primary" />}
          title="Segurança"
          subtitle="Altere sua senha de acesso"
        />

        <div className="space-y-3.5 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <FieldGroup label="Nova senha">
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="input-glass h-10 text-sm pr-10"
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
            </FieldGroup>

            <FieldGroup label="Confirmar nova senha">
              <div className="relative">
                <Input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="input-glass h-10 text-sm pr-10"
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
            </FieldGroup>
          </div>

          <div className="flex justify-end pt-1">
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword}
              variant="outline"
              size="sm"
              className="gap-2 min-w-[130px] h-9 text-xs font-semibold tracking-wide rounded-lg"
            >
              {changingPassword ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Lock className="h-3.5 w-3.5" />
              )}
              {changingPassword ? 'Alterando...' : 'Alterar senha'}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Remove Photo Confirmation Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent className="glass-card border-border/50 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold text-foreground">
              Remover foto de perfil
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed">
              Sua foto atual será removida permanentemente. Você poderá adicionar uma nova foto a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel
              className="h-9 text-xs font-medium rounded-lg"
              disabled={removingPhoto}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemovePhoto}
              disabled={removingPhoto}
              className="h-9 text-xs font-medium rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
            >
              {removingPhoto ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              {removingPhoto ? 'Removendo...' : 'Remover foto'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Reusable sub-components ── */

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground leading-tight">{title}</h3>
        <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function FieldGroup({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 uppercase tracking-wider">
        {icon}
        {label}
      </Label>
      {children}
    </div>
  );
}
