import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useInterval } from '@/hooks/useInterval';
import {
  fetchGlobalConfig,
  getGlobalConfigSync,
  isGlobalConfigFresh,
  subscribeGlobalConfig,
  type GlobalConfigSnapshot,
} from '@/lib/globalConfigCache';

type MaintenanceStatus = Omit<GlobalConfigSnapshot, 'refresh_barber_required_at'>;

const MAINTENANCE_AUTH_STORAGE_KEY = 'dub-maintenance-auth-v1';

type CachedMaintenanceAuth = { at: number; isAllowedUser: boolean; isAuthenticated: boolean };

const readStoredMaintenanceAuth = (): CachedMaintenanceAuth | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MAINTENANCE_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedMaintenanceAuth;
    if (!parsed || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > 5 * 60_000) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeStoredMaintenanceAuth = (auth: Omit<CachedMaintenanceAuth, 'at'>) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      MAINTENANCE_AUTH_STORAGE_KEY,
      JSON.stringify({ at: Date.now(), ...auth })
    );
  } catch {}
};

function toStatus(snapshot: GlobalConfigSnapshot | null): MaintenanceStatus | null {
  if (!snapshot) return null;
  const { refresh_barber_required_at: _r, ...rest } = snapshot;
  return rest;
}



/**
 * Hook central de manutenção.
 */
export function useMaintenanceMode() {
  const initialStatus = toStatus(getGlobalConfigSync());
  const initialAuth = readStoredMaintenanceAuth();
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(() => initialStatus?.manutencao_ativa || false);
  const [maintenanceMessage, setMaintenanceMessage] = useState<string | null>(() => initialStatus?.manutencao_mensagem || null);
  // Não travar o app aguardando Supabase: usa cache síncrono e valida em background.
  const [isLoading, setIsLoading] = useState(false);
  const [isAllowedUser, setIsAllowedUser] = useState(() => initialAuth?.isAllowedUser || false);
  const [isAuthenticated, setIsAuthenticated] = useState(() => initialAuth?.isAuthenticated || false);
  const [warningActive, setWarningActive] = useState(() => initialStatus?.manutencao_aviso_ativo || false);
  const [warningMessage, setWarningMessage] = useState<string | null>(() => initialStatus?.manutencao_aviso_mensagem || null);
  const [warningPublico, setWarningPublico] = useState<'cliente' | 'barbeiro' | 'ambos'>(() => initialStatus?.manutencao_aviso_publico || 'ambos');
  const [scheduledStart, setScheduledStart] = useState<Date | null>(null);
  const [scheduledEnd, setScheduledEnd] = useState<Date | null>(null);

  const checkMaintenanceStatus = useCallback(async () => {
    try {
      const status = toStatus(await fetchGlobalConfig());
      if (status) {
        processMaintenanceData(status);
      } else {
        setIsMaintenanceMode(false);
      }
    } catch (error) {
      console.error('Error checking maintenance status:', error);
      setIsMaintenanceMode(false);
    } finally {
      setIsLoading(false);
    }
  }, []);


  const processMaintenanceData = (status: MaintenanceStatus) => {
    const now = new Date();

    // Verifica manutenção manual
    let maintenanceActive = status.manutencao_ativa || false;

    // Verifica manutenção programada
    const startDate = status.manutencao_inicio_programada ? new Date(status.manutencao_inicio_programada) : null;
    const endDate = status.manutencao_fim_programada ? new Date(status.manutencao_fim_programada) : null;

    setScheduledStart(startDate);
    setScheduledEnd(endDate);

    // Se está dentro do período programado, ativa manutenção
    if (startDate && endDate && now >= startDate && now <= endDate) {
      maintenanceActive = true;
    }

    setIsMaintenanceMode(maintenanceActive);
    setMaintenanceMessage(status.manutencao_mensagem || null);

    // Aviso prévio
    setWarningActive(status.manutencao_aviso_ativo || false);
    setWarningMessage(status.manutencao_aviso_mensagem || null);
    setWarningPublico((status.manutencao_aviso_publico as 'cliente' | 'barbeiro' | 'ambos') || 'ambos');
  };

  // Polling de segurança (Realtime + visibilitychange já cobrem o caso comum):
  // - Em manutenção: 5s para destravar rápido quando desligar.
  // - Fora de manutenção: 5 min (o Realtime avisa antes disso).
  const pollingDelayMs = isLoading ? null : isMaintenanceMode ? 5000 : 300000;
  useInterval(() => {
    void checkMaintenanceStatus();
  }, pollingDelayMs);

  // Verificar se dispositivo está autorizado - PRIORIDADE MÁXIMA
  const checkDeviceAuthorization = useCallback(async (): Promise<boolean> => {
    try {
      const fingerprint = localStorage.getItem('device_fingerprint');

      if (!fingerprint) {
        return false;
      }

      const { data, error } = await supabase.rpc('is_device_authorized', {
        p_fingerprint: fingerprint,
      });

      if (error) {
        console.error('Error checking device authorization:', error);
        return false;
      }

      return data === true;
    } catch (error) {
      console.error('Error checking device authorization:', error);
      return false;
    }
  }, []);

  const checkAuthAndPermissions = useCallback(async () => {
    // PRIMEIRO: Verificar se o dispositivo está autorizado (PRIORIDADE MÁXIMA)
    // Isso acontece ANTES de qualquer outra verificação
    const isDeviceAuth = await checkDeviceAuthorization();
    if (isDeviceAuth) {
      // Dispositivo autorizado = acesso total, independente de email ou login
      setIsAllowedUser(true);
      setIsAuthenticated(true); // Assume autenticado se dispositivo autorizado
      writeStoredMaintenanceAuth({ isAllowedUser: true, isAuthenticated: true });
      return;
    }

    // Se dispositivo NÃO está autorizado, verificar autenticação e email
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user ?? null;

    if (user) {
      setIsAuthenticated(true);

      // Verifica se o email está na lista de permitidos
      if (user.email) {
        const { data: isAllowed } = await supabase.rpc('is_email_allowed_maintenance', {
          p_email: user.email,
        });

        if (isAllowed) {
          setIsAllowedUser(true);
          writeStoredMaintenanceAuth({ isAllowedUser: true, isAuthenticated: true });
          return;
        }
      }

      // Se não está na lista de emails/dispositivos permitidos, não tem acesso durante manutenção
      setIsAllowedUser(false);
      writeStoredMaintenanceAuth({ isAllowedUser: false, isAuthenticated: true });
    } else {
      setIsAuthenticated(false);
      setIsAllowedUser(false);
      writeStoredMaintenanceAuth({ isAllowedUser: false, isAuthenticated: false });
    }
  }, [checkDeviceAuthorization]);

  useEffect(() => {
    if (!isGlobalConfigFresh()) {
      void checkMaintenanceStatus();
    }
    // Se já temos autorização fresca em cache, não bloqueia o boot com RPCs
    // de manutenção/dispositivo. Revalida só quando o navegador estiver livre.
    if (initialAuth) {
      const runAuthCheck = () => void checkAuthAndPermissions();
      const idleId = window.requestIdleCallback?.(runAuthCheck, { timeout: 5000 });
      if (!idleId) {
        window.setTimeout(runAuthCheck, 3000);
      }
    } else {
      void checkAuthAndPermissions();
    }

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void checkAuthAndPermissions();
    });

    // Realtime de webhook_config já é gerenciado por globalConfigCache;
    // aqui apenas assinamos a mudança de snapshot para reagir na UI.
    const unsubGlobal = subscribeGlobalConfig((snapshot) => {
      const status = toStatus(snapshot);
      if (status) processMaintenanceData(status);
      else setIsMaintenanceMode(false);
    });

    // Apenas o Realtime específico de dispositivos autorizados continua próprio.
    const channel = supabase
      .channel(`maintenance-devices-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dispositivos_autorizados',
        },
        () => {
          void checkAuthAndPermissions();
        }
      )
      .subscribe();


    // Refetch apenas quando a aba volta a ficar visível (evita duplicidade com focus).
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkMaintenanceStatus();
        void checkAuthAndPermissions();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      subscription.unsubscribe();
      supabase.removeChannel(channel);
      unsubGlobal();
    };

  }, [checkMaintenanceStatus, checkAuthAndPermissions]);

  return {
    isMaintenanceMode,
    maintenanceMessage,
    isLoading,
    isAllowedUser,
    isAuthenticated,
    warningActive,
    warningMessage,
    warningPublico,
    scheduledStart,
    scheduledEnd,
    refresh: checkMaintenanceStatus,
  };
}

