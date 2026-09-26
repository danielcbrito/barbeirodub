import type { ElementType } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface BottomNavItemProps {
  icon: ElementType;

  label: string;
  onClick: () => void;
  isActive?: boolean;
  isCenter?: boolean;
  badgeCount?: number;
}

export function BottomNavItem({
  icon: Icon,
  label,
  onClick,
  isActive = false,
  isCenter = false,
  badgeCount,
}: BottomNavItemProps) {
  if (isCenter) {
    return (
      <motion.button
        onClick={onClick}
        whileTap={{ scale: 0.9 }}
        className="flex flex-col items-center justify-center relative -mt-6"
      >
        {/* Glow effect */}
        <div
          className="absolute inset-0 rounded-full blur-xl opacity-40"
          style={{
            background: "radial-gradient(circle, hsl(var(--primary) / 0.5), transparent 70%)",
            transform: "scale(1.5)",
          }}
        />

        {/* Main button */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-lg"
        >
          {/* Inner highlight */}
          <div
            className="absolute inset-0 rounded-full opacity-20"
            style={{
              background: "linear-gradient(180deg, hsl(var(--primary-foreground) / 0.3) 0%, transparent 50%)",
            }}
          />
          <Icon className="w-6 h-6 text-primary-foreground relative z-10" strokeWidth={2} />
        </motion.div>

        <span className="text-[10px] font-semibold mt-1.5 tracking-wide text-primary">
          {label}
        </span>
      </motion.button>
    );
  }

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      className="flex flex-col items-center justify-start flex-1 pt-2 pb-2 px-1 relative group gap-2"
    >
      {/* Icon */}
      <div className="relative">
        <Icon 
          className={cn(
            "w-[26px] h-[26px] transition-colors duration-200",
            isActive ? "text-primary" : "text-foreground"
          )} 
          strokeWidth={isActive ? 2.2 : 1.8}
        />

        {/* Badge */}
        {typeof badgeCount === "number" && badgeCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center leading-none ring-2 ring-background"
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </motion.span>
        )}
      </div>

      <span 
        className={cn(
          "text-[10px] leading-none tracking-wide transition-colors duration-200",
          isActive ? "text-primary font-medium" : "text-foreground"
        )}
      >
        {label}
      </span>

    </motion.button>
  );
}
