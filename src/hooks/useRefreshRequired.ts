import { useState, useEffect, useCallback } from 'react';
import {
  fetchGlobalConfig,
  getGlobalConfigSync,
  subscribeGlobalConfig,
  type GlobalConfigSnapshot,
} from '@/lib/globalConfigCache';

/**
 * Hook to manage the global "Refresh Required" overlay logic.
 * Usa o cache global compartilhado (webhook_config) — sem query própria.
 */
function computeOverlay(snapshot: GlobalConfigSnapshot | null) {
  const refreshAt = snapshot?.refresh_barber_required_at ?? null;
  if (!refreshAt) return { show: false, requiredAt: null as string | null };
  const lastAck =
    typeof window !== 'undefined' ? sessionStorage.getItem('last_refresh_ack') : null;
  const isNewer = !lastAck || new Date(refreshAt) > new Date(lastAck);
  return { show: isNewer, requiredAt: refreshAt };
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
    if (requiredAt) {
      sessionStorage.setItem('last_refresh_ack', requiredAt);
      window.location.reload();
    }
  }, [requiredAt]);

  return { showRefreshOverlay, handleRefresh };
}

