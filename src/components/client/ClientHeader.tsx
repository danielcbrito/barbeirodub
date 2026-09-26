import { motion } from "framer-motion";

interface ClientHeaderProps {
  profileName?: string;
  email?: string;
}

export function ClientHeader({ profileName, email }: ClientHeaderProps) {
  const firstName = profileName ? String(profileName).split(" ")[0] : null;
  const initials = firstName ? firstName.charAt(0).toUpperCase() : "?";

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between px-4 pb-3"
      style={{ paddingTop: "calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 0.75rem)" }}
    >
      {/* Greeting */}
      <div className="flex-1 min-w-0">
        <motion.h1 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="text-xl font-bold text-foreground tracking-tight"
        >
          {firstName ? `Olá, ${firstName}!` : "Olá!"}
        </motion.h1>
        {email && (
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-xs text-muted-foreground truncate"
          >
            {email}
          </motion.p>
        )}
      </div>

      {/* Avatar */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="w-11 h-11 rounded-full bg-primary flex items-center justify-center relative overflow-hidden shadow-md"
      >
        {/* Inner glow */}
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            background: "radial-gradient(circle at 30% 30%, hsl(var(--primary-foreground) / 0.3), transparent 60%)",
          }}
        />
        <span className="relative z-10 text-primary-foreground font-bold text-sm">
          {initials}
        </span>
      </motion.div>
    </motion.div>
  );
}
