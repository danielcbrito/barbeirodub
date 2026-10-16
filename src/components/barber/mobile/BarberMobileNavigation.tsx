import { AppMobileBottomBar } from "@/components/layout/AppMobileBottomBar";

/**
 * Bottom navigation mobile do barbeiro — usa a barra compartilhada.
 */
export function BarberMobileNavigation({
  basePath = "/barbeiro",
  barbeiroId,
}: {
  basePath?: string;
  barbeiroId?: string | null;
}) {
  return <AppMobileBottomBar basePath={basePath} barbeiroId={barbeiroId} />;
}
