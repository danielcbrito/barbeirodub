import logoImage from "@/assets/logo-dub.png";

/**
 * Avatar Premium do Bot ChatDUB
 */
export function BotAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12"
  };

  return (
    <div 
      className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-primary/20 to-primary/10 backdrop-blur-xl border border-foreground/10 flex items-center justify-center shadow-lg shrink-0`}
      style={{
        boxShadow: "0 8px 24px rgba(217, 65, 65, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)"
      }}
    >
      <img 
        src={logoImage} 
        alt="ChatDUB" 
        className="h-5 w-5 object-contain"
      />
    </div>
  );
}
