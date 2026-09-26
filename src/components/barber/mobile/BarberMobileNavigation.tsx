import { AppMobileBottomBar } from "@/components/layout/AppMobileBottomBar";

/**
 * Bottom navigation mobile do barbeiro — usa a barra compartilhada.
 */
export function BarberMobileNavigation({ basePath = "/barbeiro" }: { basePath?: string }) {
  return <AppMobileBottomBar basePath={basePath} />;
}
