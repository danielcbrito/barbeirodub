import { AppMobileBottomBar } from "@/components/layout/AppMobileBottomBar";

/**
 * Bottom navigation mobile do admin — usa a barra compartilhada.
 */
export function AdminMobileNavigation({ basePath = "/admin" }: { basePath?: string }) {
  return <AppMobileBottomBar basePath={basePath} />;
}
