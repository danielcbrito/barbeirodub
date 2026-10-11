import { AppMobileBottomBar } from "@/components/layout/AppMobileBottomBar";

/**
 * Bottom navigation mobile do admin — usa a barra compartilhada.
 */
export function AdminMobileNavigation({
  basePath = "/admin",
  barbeiroId,
}: {
  basePath?: string;
  barbeiroId?: string | null;
}) {
  return <AppMobileBottomBar basePath={basePath} barbeiroId={barbeiroId} />;
}
