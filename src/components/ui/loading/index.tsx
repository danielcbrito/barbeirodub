import { cn } from "@/lib/utils";

/**
 * Skeletons contextuais bonitos - substitui spinners genéricos.
 * Shimmer suave via CSS puro para performance máxima.
 */

interface ShimmerProps {
  className?: string;
}

export function Shimmer({ className }: ShimmerProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/50",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:animate-[shimmer_1.6s_ease-in-out_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-muted-foreground/10 before:to-transparent",
        className
      )}
    />
  );
}

/** Estado "consultando..." bonito - texto contextual + shimmer, nunca spinner isolado */
export function ConsultingState({
  label = "Consultando...",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-8 px-6",
        className
      )}
    >
      <div className="w-full max-w-sm space-y-3">
        <Shimmer className="h-4 w-3/4 mx-auto" />
        <Shimmer className="h-3 w-1/2 mx-auto" />
      </div>
      <p className="text-sm text-muted-foreground animate-pulse">{label}</p>
    </div>
  );
}

/** Skeleton para o Início - cards de métrica */
export function HomeSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Shimmer className="h-32 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <Shimmer className="h-24 rounded-xl" />
        <Shimmer className="h-24 rounded-xl" />
        <Shimmer className="h-24 rounded-xl" />
        <Shimmer className="h-24 rounded-xl" />
      </div>
      <Shimmer className="h-40 w-full rounded-xl" />
    </div>
  );
}

/** Skeleton para a Agenda - linhas de horário */
export function AgendaSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-3 mb-4">
        <Shimmer className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Shimmer className="h-4 w-1/3" />
          <Shimmer className="h-3 w-1/4" />
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Shimmer className="h-3 w-12" />
          <Shimmer className="h-16 flex-1 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton para Disparo - lista de clientes com avatar */
export function DisparoSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2">
          <Shimmer className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-3 w-1/2" />
            <Shimmer className="h-3 w-1/3" />
          </div>
          <Shimmer className="h-4 w-4 rounded" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton para Perfil - banner + avatar + campos */
export function PerfilSkeleton() {
  return (
    <div className="space-y-4">
      <Shimmer className="h-40 w-full" />
      <div className="px-4 -mt-12 relative">
        <Shimmer className="h-24 w-24 rounded-full border-4 border-background" />
      </div>
      <div className="p-4 space-y-3">
        <Shimmer className="h-5 w-1/3" />
        <Shimmer className="h-4 w-1/2" />
        <div className="grid grid-cols-3 gap-3 pt-4">
          <Shimmer className="h-16 rounded-lg" />
          <Shimmer className="h-16 rounded-lg" />
          <Shimmer className="h-16 rounded-lg" />
        </div>
        <div className="space-y-2 pt-4">
          <Shimmer className="h-12 w-full rounded-lg" />
          <Shimmer className="h-12 w-full rounded-lg" />
          <Shimmer className="h-12 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton genérico de lista */
export function ListSkeleton({
  rows = 5,
  showAvatar = false,
}: {
  rows?: number;
  showAvatar?: boolean;
}) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg">
          {showAvatar && <Shimmer className="h-10 w-10 rounded-full" />}
          <div className="flex-1 space-y-2">
            <Shimmer className="h-4 w-3/4" />
            <Shimmer className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton para cards em grid */
export function CardGridSkeleton({
  count = 6,
  columns = 2,
}: {
  count?: number;
  columns?: 1 | 2 | 3 | 4;
}) {
  const colClass = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-2 md:grid-cols-3",
    4: "grid-cols-2 md:grid-cols-4",
  }[columns];

  return (
    <div className={cn("grid gap-3 p-4", colClass)}>
      {Array.from({ length: count }).map((_, i) => (
        <Shimmer key={i} className="h-32 rounded-xl" />
      ))}
    </div>
  );
}
