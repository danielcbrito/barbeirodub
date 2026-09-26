import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { hasStoredSupabaseSession } from "@/lib/sessionGuard";

interface WhatsAppStatus {
  isConnected: boolean;
  isLoading: boolean;
  instanceName: string | null;
  resolvedBarbeiroId: string | null;
}

/**
 * Hook que verifica se o barbeiro (ou seu tenant) tem uma instância WhatsApp conectada.
 * Segue a mesma hierarquia de resolução do whatsappInstanceHelper:
 * 1. Instância do próprio barbeiro
 * 2. Instância do owner do tenant
 * 3. Qualquer instância conectada do mesmo tenant
 */
export function useWhatsAppStatus(barbeiroId: string | null | undefined): WhatsAppStatus {
  const cached = barbeiroId ? readWhatsAppCache(barbeiroId) : null;
  const [isConnected, setIsConnected] = useState(cached?.isConnected ?? false);
  const [isLoading, setIsLoading] = useState(!cached);
  const [instanceName, setInstanceName] = useState<string | null>(cached?.instanceName ?? null);
  const [resolvedBarbeiroId, setResolvedBarbeiroId] = useState<string | null>(cached?.resolvedBarbeiroId ?? null);

  useEffect(() => {
    if (!barbeiroId) {
      setIsConnected(false);
      setInstanceName(null);
      setResolvedBarbeiroId(null);
      setIsLoading(false);
      return;
    }

    const check = async () => {
      setIsLoading(true);
      setResolvedBarbeiroId(null);

      try {
        // 1. Verificar instância do próprio barbeiro
        const { data: ownInstances } = await supabase
          .from("whatsapp_instances")
          .select("status, instance_name, updated_at, connected_at")
          .eq("barbeiro_id", barbeiroId)
          .eq("status", "connected")
          .order("connected_at", { ascending: false, nullsFirst: false })
          .order("updated_at", { ascending: false, nullsFirst: false })
          .limit(1);

        const ownInstance = ownInstances?.[0] ?? null;

        if (ownInstance) {
          setIsConnected(true);
          setInstanceName(ownInstance.instance_name || null);
          setResolvedBarbeiroId(barbeiroId);
          return;
        }

        // 2. Descobrir tenant_id do barbeiro
        const { data: barbeiro } = await supabase
          .from("barbeiros")
          .select("tenant_id")
          .eq("id", barbeiroId)
          .maybeSingle();

        const tenantId = barbeiro?.tenant_id || null;

        if (tenantId) {
          // 3. Buscar qualquer instância conectada de barbeiros do mesmo tenant
          const { data: tenantBarbers } = await supabase
            .from("barbeiros")
            .select("id")
            .eq("tenant_id", tenantId);

          if (tenantBarbers?.length) {
            const ids = tenantBarbers.map((b) => b.id);
            const { data: tenantInstances } = await supabase
              .from("whatsapp_instances")
              .select("status, instance_name, updated_at, connected_at")
              .in("barbeiro_id", ids)
              .eq("status", "connected")
              .limit(1)
              .order("connected_at", { ascending: false, nullsFirst: false })
              .order("updated_at", { ascending: false, nullsFirst: false });

            const tenantInst = tenantInstances?.[0] ?? null;

            if (tenantInst) {
              setIsConnected(true);
              setInstanceName(tenantInst.instance_name || null);
              setResolvedBarbeiroId(barbeiroId);
              return;
            }
          }
        }

        // Nenhuma instância conectada encontrada
        setIsConnected(false);
        setInstanceName(null);
        setResolvedBarbeiroId(barbeiroId);
      } catch {
        setIsConnected(false);
        setInstanceName(null);
        setResolvedBarbeiroId(barbeiroId);
      } finally {
        setIsLoading(false);
      }
    };

    if (!cached || Date.now() - cached.at >= 5 * 60_000) {
      check();
    } else {
      setIsConnected(cached.isConnected);
      setInstanceName(cached.instanceName);
      setResolvedBarbeiroId(cached.resolvedBarbeiroId);
      setIsLoading(false);
    }

    // Realtime para atualizar quando o status mudar
    const channel = supabase
      .channel(`whatsapp-status-${barbeiroId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "whatsapp_instances",
      }, async () => {
        await check();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [barbeiroId]);

  const isResolvingCurrentBarber = !!barbeiroId && resolvedBarbeiroId !== barbeiroId;

  return {
    isConnected,
    isLoading: isLoading || isResolvingCurrentBarber,
    instanceName,
    resolvedBarbeiroId,
  };
}

const WHATSAPP_CACHE_PREFIX = "dub:barber-whatsapp:v1:";

type CachedWhatsApp = {
  at: number;
  isConnected: boolean;
  instanceName: string | null;
  resolvedBarbeiroId: string;
};

function readWhatsAppCache(barbeiroId: string): CachedWhatsApp | null {
  if (typeof window === "undefined" || !hasStoredSupabaseSession()) return null;
  try {
    const raw = localStorage.getItem(WHATSAPP_CACHE_PREFIX + barbeiroId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedWhatsApp;
    return typeof parsed?.at === "number" ? parsed : null;
  } catch {
    return null;
  }
}
