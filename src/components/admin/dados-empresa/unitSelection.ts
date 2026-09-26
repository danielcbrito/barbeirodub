export const TENANT_ROOT_UNIT_ID = "tenant-root";

export interface DadosEmpresaUnitOption {
  id: string;
  nome: string;
  is_sede: boolean;
  source: "tenant" | "unit";
  logoUrl?: string | null;
}

export function isTenantRootUnit(unidadeId?: string | null) {
  return !unidadeId || unidadeId === TENANT_ROOT_UNIT_ID;
}

export function buildDadosEmpresaSearch(unidadeId?: string | null) {
  if (!unidadeId) return "";

  const params = new URLSearchParams();
  params.set("unidade", unidadeId);

  return `?${params.toString()}`;
}