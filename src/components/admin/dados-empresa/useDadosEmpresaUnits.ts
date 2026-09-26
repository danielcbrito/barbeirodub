import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DadosEmpresaUnitOption, TENANT_ROOT_UNIT_ID } from "./unitSelection";

export function useDadosEmpresaUnits(tenantId?: string | null) {
  const [units, setUnits] = useState<DadosEmpresaUnitOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadUnits = async () => {
      setLoading(true);

      try {
        if (!tenantId) {
          if (active) {
            setUnits([
              {
                id: TENANT_ROOT_UNIT_ID,
                nome: "Barbearia principal",
                is_sede: true,
                source: "tenant",
              },
            ]);
          }
          return;
        }

        const [{ data: tenant }, { data: unitRows, error: unitError }] = await Promise.all([
          supabase.from("tenants").select("nome, logo_url").eq("id", tenantId).maybeSingle(),
          supabase
            .from("tenant_unidades")
            .select("id, nome, is_sede, logo_url")
            .eq("tenant_id", tenantId)
            .eq("ativo", true)
            .order("is_sede", { ascending: false })
            .order("nome"),
        ]);

        if (unitError) throw unitError;

        const mappedUnits: DadosEmpresaUnitOption[] = (unitRows || []).map((unit) => ({
          id: unit.id,
          nome: unit.nome,
          is_sede: !!unit.is_sede,
          source: "unit",
          logoUrl: unit.logo_url,
        }));

        const hasSede = mappedUnits.some((unit) => unit.is_sede);
        const tenantRoot: DadosEmpresaUnitOption = {
          id: TENANT_ROOT_UNIT_ID,
          nome: tenant?.nome || "Barbearia principal",
          is_sede: true,
          source: "tenant",
          logoUrl: tenant?.logo_url || null,
        };

        const nextUnits = mappedUnits.length === 0 || !hasSede
          ? [tenantRoot, ...mappedUnits]
          : mappedUnits;

        if (active) {
          setUnits(nextUnits);
        }
      } catch (error) {
        console.error("Erro ao carregar unidades:", error);
        toast.error("Erro ao carregar unidades");

        if (active) {
          setUnits([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadUnits();

    return () => {
      active = false;
    };
  }, [tenantId]);

  const defaultUnit = useMemo(
    () => units.find((unit) => unit.is_sede) ?? units[0] ?? null,
    [units],
  );

  return {
    units,
    loading,
    defaultUnit,
  };
}