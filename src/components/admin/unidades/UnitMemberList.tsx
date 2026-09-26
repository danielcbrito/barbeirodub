import { useState } from 'react';
import { QUERY_KEYS } from '@/lib/queryKeys';
import { useBarberUnitRoles, type RoleLevel, type BarberUnitMember } from '@/hooks/useBarberUnitRoles';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Users } from 'lucide-react';
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
import { EditRoleSheet } from './EditRoleSheet';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface UnitMemberListProps {
  unidadeId: string;
  panelMode: 'admin' | 'tenant';
  unitName?: string;
}

const ROLE_BADGE: Record<RoleLevel, { label: string; className: string }> = {
  barber: { label: 'Barbeiro', className: 'font-mono text-[11px] border-border/50 text-muted-foreground bg-muted/30' },
  unit_admin: { label: 'Admin da Unidade', className: 'font-mono text-[11px] border-amber-500/50 text-amber-400 bg-amber-500/10' },
  full_control: { label: 'Controle Total', className: 'font-mono text-[11px] border-primary/50 text-primary bg-primary/10' },
};

export function UnitMemberList({ unidadeId, unitName }: UnitMemberListProps) {
  const { members, isLoading, error, refetch } = useBarberUnitRoles(unidadeId);
  const [selectedMember, setSelectedMember] = useState<BarberUnitMember | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [removeMember, setRemoveMember] = useState<BarberUnitMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleOpenPermissions = (member: BarberUnitMember) => {
    setSelectedMember(member);
    setSheetOpen(true);
  };

  const handleRemoveBarber = async () => {
    if (!removeMember) return;
    setRemoving(true);
    try {
      const { error: err } = await supabase
        .from('barbeiro_unidades')
        .delete()
        .eq('id', removeMember.id);
      if (err) throw err;

      const nome = removeMember.barbeiro.profile?.nome ?? removeMember.barbeiro.apelido;
      toast({
        title: `${nome} foi removido da unidade.`,
        description: 'O acesso foi revogado imediatamente.',
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.shared.unitMembers(unidadeId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.shared.unitMembers(unidadeId) });
      setRemoveMember(null);
    } catch {
      toast({ title: 'Erro ao remover barbeiro.', description: 'Verifique sua conexão e tente novamente.', variant: 'destructive' });
    } finally {
      setRemoving(false);
    }
  };

  /* ── Loading skeleton ── */
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-[200px]" />
        <Skeleton className="h-4 w-[140px]" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <Skeleton className="h-[38px] w-[38px] rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  /* ── Error ── */
  if (error) {
    return (
      <div className="space-y-3 text-center py-6">
        <p className="text-sm text-destructive">{error.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section heading */}
      <div>
        <h2 className="text-lg font-bold text-foreground">Equipe</h2>
        <p className="text-[13px] text-[#4B5563] mt-0.5">
          {members.length} profissiona{members.length === 1 ? 'l' : 'is'} vinculado{members.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Empty */}
      {members.length === 0 && (
        <div className="flex flex-col items-center text-center py-12">
          <Users className="w-7 h-7 text-muted-foreground/30 mb-3" strokeWidth={1.5} />
          <p className="text-[15px] font-semibold text-muted-foreground">
            Nenhum barbeiro nesta unidade.
          </p>
          <p className="text-[13px] text-[#4B5563] mt-1.5 max-w-[260px]">
            Adicione barbeiros para que possam atender clientes nesta unidade.
          </p>
        </div>
      )}

      {/* List */}
      {members.map((member) => {
        const badge = ROLE_BADGE[member.role_level];
        const nome = member.barbeiro.profile?.nome ?? member.barbeiro.apelido;
        const firstLetter = nome.charAt(0).toUpperCase();
        const lastWord = nome.split(' ').pop() || '';
        const secondLetter = lastWord.charAt(0).toUpperCase();
        const initials = nome.includes(' ') ? `${firstLetter}${secondLetter}` : firstLetter;

        return (
          <div
            key={member.id}
            className="flex items-center gap-3 py-3 rounded-lg hover:bg-accent/50 transition-colors duration-150 px-2 -mx-2 group"
          >
            {/* Avatar 38×38 with status dot */}
            <div className="relative shrink-0">
              <Avatar className="h-[38px] w-[38px]">
                {member.barbeiro.foto_url && (
                  <AvatarImage src={member.barbeiro.foto_url} alt={nome} />
                )}
                <AvatarFallback
                  className="font-mono text-xs text-foreground"
                  style={{ background: 'linear-gradient(135deg, #1C2333, #2D3748)' }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              {/* Status dot */}
              <span
                className="absolute -bottom-0.5 -right-0.5 w-[7px] h-[7px] rounded-full border border-background"
                style={{ backgroundColor: member.barbeiro.ativo ? '#34D399' : '#1F2937' }}
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[#E5E7EB] truncate">{nome}</p>
            </div>

            {/* Role badge (text-only, DM Mono) */}
            <Badge variant="outline" className={badge.className}>
              {badge.label}
            </Badge>

            {/* Permissions button — always visible on mobile, hover on desktop */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenPermissions(member)}
              className="h-7 px-2 text-xs opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
            >
              Permissões
            </Button>
          </div>
        );
      })}

      {/* Edit role sheet */}
      <EditRoleSheet
        member={selectedMember}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        unidadeId={unidadeId}
      />

      {/* Remove confirmation dialog */}
      <AlertDialog open={!!removeMember} onOpenChange={(open) => !open && setRemoveMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover barbeiro</AlertDialogTitle>
            <AlertDialogDescription>
              {removeMember && (
                <>
                  <strong className="text-foreground">
                    {removeMember.barbeiro.profile?.nome ?? removeMember.barbeiro.apelido}
                  </strong>{' '}
                  será removido desta unidade{unitName ? ` (${unitName})` : ''}. O acesso será revogado imediatamente. Esta ação não pode ser desfeita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveBarber}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? 'Removendo...' : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
