import { useState } from "react";
import { Card } from "@/components/ui/card";
import { ptBR } from "date-fns/locale";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AgendaMensalViewProps {
  appointments: any[];
  onSelectDate: (date: Date) => void;
}

export function AgendaMensalView({ appointments, onSelectDate }: AgendaMensalViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get starting day of week (0 = Sunday, 1 = Monday, etc.)
  const startingDayOfWeek = monthStart.getDay();

  // Create array of days including empty cells for alignment
  const calendarDays = Array(startingDayOfWeek).fill(null).concat(daysInMonth);

  const getAppointmentsForDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return appointments.filter(apt => apt.data === dateStr);
  };

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-green-500";
      case "pending":
        return "bg-yellow-500";
      case "completed":
        return "bg-blue-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <Card className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">
          {format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={previousMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-2 mb-2">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
          <div key={day} className="text-center text-sm font-semibold text-muted-foreground p-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-2">
        {calendarDays.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="aspect-square" />;
          }

          const dayAppointments = getAppointmentsForDate(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isTodayDate = isToday(day);

          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className={`
                aspect-square p-2 rounded-lg border-2 transition-all hover:border-primary
                ${isCurrentMonth ? "bg-card" : "bg-muted/30 opacity-50"}
                ${isTodayDate ? "border-primary ring-2 ring-primary/20" : "border-border"}
                ${dayAppointments.length > 0 ? "hover:bg-primary/5" : ""}
              `}
            >
              <div className="flex flex-col h-full">
                <span className={`text-sm font-semibold ${isTodayDate ? "text-primary" : ""}`}>
                  {format(day, "d")}
                </span>
                
                {dayAppointments.length > 0 && (
                  <div className="flex-1 flex flex-col justify-center items-center gap-1 mt-1">
                    <span className="text-xs font-bold text-foreground">
                      {dayAppointments.length}
                    </span>
                    <div className="flex gap-1 flex-wrap justify-center">
                      {dayAppointments.slice(0, 3).map((apt, i) => (
                        <div
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full ${getStatusColor(apt.status)}`}
                        />
                      ))}
                      {dayAppointments.length > 3 && (
                        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>Confirmado</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span>Pendente</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span>Concluído</span>
        </div>
      </div>
    </Card>
  );
}
