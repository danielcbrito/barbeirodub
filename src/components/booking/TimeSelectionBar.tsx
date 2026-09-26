import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimeSelectionBarProps {
  selectedDate: Date | null;
  selectedTime: string;
  formattedDate: string;
  onContinue: () => void;
  isVisible: boolean;
  isLoading?: boolean;
  className?: string;
}

export function TimeSelectionBar({
  selectedDate,
  selectedTime,
  formattedDate,
  onContinue,
  isVisible,
  isLoading = false,
  className
}: TimeSelectionBarProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 40
          }}
          className={cn("fixed bottom-0 left-0 right-0 z-40", className)}
        >
          <div className="relative px-4 pb-safe">
            {/* Fade gradient */}
            <div className="absolute -top-12 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none" />
            
            {/* Compact floating bar */}
            <div 
              className="relative mx-auto max-w-md"
              style={{
                borderRadius: "16px",
                background: "rgba(18, 18, 20, 0.95)",
                boxShadow: `
                  0 0 0 1px rgba(255, 255, 255, 0.08),
                  0 8px 32px -8px rgba(0, 0, 0, 0.6),
                  0 4px 16px -4px rgba(239, 68, 68, 0.1)
                `,
                backdropFilter: "blur(20px)"
              }}
            >
              {/* Subtle top accent */}
              <div 
                className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-[1px]"
                style={{
                  background: "linear-gradient(90deg, transparent, hsl(var(--primary) / 0.5), transparent)"
                }}
              />
              
              {/* Content - compact layout */}
              <div className="flex items-center justify-between px-4 py-3">
                
                {/* Left: Time info */}
                <div className="flex items-center gap-3">
                  {/* Check icon */}
                  <div 
                    className="flex items-center justify-center w-9 h-9 rounded-xl"
                    style={{
                      background: "linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(34, 197, 94, 0.05))"
                    }}
                  >
                    <Check className="w-4 h-4 text-green-500" />
                  </div>
                  
                  {/* Time and date */}
                  <div>
                    <span className="text-base font-semibold text-foreground">{selectedTime}</span>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">{formattedDate}</p>
                  </div>
                </div>

                {/* Right: CTA Button */}
                <motion.button
                  onClick={onContinue}
                  disabled={isLoading}
                  whileHover={{ scale: isLoading ? 1 : 1.02 }}
                  whileTap={{ scale: isLoading ? 1 : 0.98 }}
                  className={cn(
                    "group flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-primary-foreground",
                    isLoading && "cursor-wait opacity-70"
                  )}
                  style={{
                    background: "hsl(var(--primary))",
                    boxShadow: "0 2px 12px hsl(var(--primary) / 0.2)"
                  }}
                >
                  {isLoading ? (
                    <>
                      <motion.div 
                        className="w-4 h-4 border-2 border-foreground/30 border-t-white rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      />
                      <span>Verificando...</span>
                    </>
                  ) : (
                    <>
                      <span>Continuar</span>
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </motion.button>
              </div>
            </div>
            
            {/* Safe area padding */}
            <div className="h-3" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
