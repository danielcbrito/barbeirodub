import { useState, useEffect, useCallback } from 'react';
import {
  fetchGlobalConfig,
  getGlobalConfigSync,
  subscribeGlobalConfig,
  invalidateGlobalConfig,
  type GlobalConfigSnapshot,
} from '@/lib/globalConfigCache';

const STORAGE_KEY_ACK = 'last_refresh_ack';
const STORAGE_KEY_ACK_TIME = 'last_refresh_ack_time';

function isAcknowledged(refreshAt: string | null): boolean {
  if (!refreshAt) return true;
  if (typeof window === 'undefined') return false;

  try {
    const lastAck =
      localStorage.getItem(STORAGE_KEY_ACK) ||
      sessionStorage.getItem(STORAGE_KEY_ACK);

    const lastAckTimeStr =
      localStorage.getItem(STORAGE_KEY_ACK_TIME) ||
      sessionStorage.getItem(STORAGE_KEY_ACK_TIME);

    const lastAckTime = lastAckTimeStr ? Number(lastAckTimeStr) : 0;

    // Se o usuário já confirmou, verifica se a confirmação foi no mesmo momento ou após a exigência
    if (lastAckTime > 0) {
      const targetTime = new Date(refreshAt).getTime();
      if (!isNaN(targetTime) && lastAckTime >= targetTime) {
        return true;
      }
      // Janela de proteção contínua após confirmação (1 hora)
      if (Date.now() - lastAckTime < 3600_000) {
        return true;
      }
    }

    // Se a confirmação foi para a mesma versão/timestamp exata
    if (lastAck && lastAck === refreshAt) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function computeOverlay(snapshot: GlobalConfigSnapshot | null) {
  const refreshAt = snapshot?.refresh_barber_required_at ?? null;
  if (!refreshAt) return { show: false, requiredAt: null as string | null };

  const acknowledged = isAcknowledged(refreshAt);
  return { show: !acknowledged, requiredAt: refreshAt };
}

export function useRefreshRequired() {
  const initial = computeOverlay(getGlobalConfigSync());
  const [showRefreshOverlay, setShowRefreshOverlay] = useState(initial.show);
  const [requiredAt, setRequiredAt] = useState<string | null>(initial.requiredAt);

  useEffect(() => {
    const apply = (snapshot: GlobalConfigSnapshot | null) => {
      const next = computeOverlay(snapshot);
      setShowRefreshOverlay(next.show);
      setRequiredAt(next.requiredAt);
    };

    void fetchGlobalConfig().then(apply);
    const unsub = subscribeGlobalConfig(apply);
    return () => unsub();
  }, []);

  const handleRefresh = useCallback(() => {
    // 1. Oculta imediatamente a sobreposição no React
    setShowRefreshOverlay(false);

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const ackValue = requiredAt || nowIso;

    // 2. Persiste confirmação tanto em localStorage quanto em sessionStorage
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_ACK, ackValue);
        sessionStorage.setItem(STORAGE_KEY_ACK, ackValue);
        localStorage.setItem(STORAGE_KEY_ACK_TIME, String(now));
        sessionStorage.setItem(STORAGE_KEY_ACK_TIME, String(now));
      }
    } catch (e) {
      console.warn('[useRefreshRequired] storage error:', e);
    }

    // 3. Invalida cache de configuração
    try {
      invalidateGlobalConfig();
    } catch {}

    // 4. Limpeza assíncrona não bloqueante (não trava a tela com await)
    try {
      if ('serviceWorker' in navigator) {
        void navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => void r.unregister());
        });
      }
    } catch {}

    try {
      if ('caches' in window) {
        void caches.keys().then((keys) => {
          keys.forEach((key) => void caches.delete(key));
        });
      }
    } catch {}

    // 5. Força recarregamento instantâneo da página
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('v_refresh', String(now));
      window.location.replace(url.toString());
    } catch {
      window.location.reload();
    }
  }, [requiredAt]);

  return { showRefreshOverlay, handleRefresh };
}
