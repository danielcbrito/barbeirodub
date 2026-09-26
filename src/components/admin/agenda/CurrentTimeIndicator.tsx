import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { format, isSameDay } from "date-fns";

interface CurrentTimeIndicatorProps {
  selectedDate: Date;
  businessHours: {
    hora_abertura: string;
    hora_fechamento: string;
  };
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function CurrentTimeIndicator({ selectedDate, businessHours }: CurrentTimeIndicatorProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Only show on today
  if (!isSameDay(selectedDate, now)) {
    return null;
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = timeToMinutes(businessHours.hora_abertura);
  const closeMinutes = timeToMinutes(businessHours.hora_fechamento);

  // Check if current time is within business hours
  if (currentMinutes < openMinutes || currentMinutes > closeMinutes) {
    return null;
  }

  // Calculate position percentage
  const totalMinutes = closeMinutes - openMinutes;
  const elapsedMinutes = currentMinutes - openMinutes;
  const positionPercent = (elapsedMinutes / totalMinutes) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="absolute left-0 right-0 z-20 pointer-events-none"
      style={{ top: `${positionPercent}%` }}
    >
      <div className="relative flex items-center">
        {/* Time label */}
        <div className="absolute -left-2 -translate-x-full">
          <span className="px-2 py-1 text-[10px] font-semibold rounded-md bg-red-500 text-foreground shadow-lg shadow-red-500/30">
            {format(now, "HH:mm")}
          </span>
        </div>

        {/* Dot */}
        <div className="relative">
          <div className="w-3 h-3 rounded-full bg-red-500 shadow-lg shadow-red-500/50">
            <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
          </div>
        </div>

        {/* Line */}
        <div className="flex-1 h-[2px] bg-gradient-to-r from-red-500 via-red-500/50 to-transparent" />
      </div>
    </motion.div>
  );
}