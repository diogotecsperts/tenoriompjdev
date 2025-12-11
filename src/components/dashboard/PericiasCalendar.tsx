import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PericiasCalendarProps {
  pericias: Array<{
    id: string;
    dataPericia: string | null;
    vitimaName?: string;
    processoNumero?: string;
    status?: string;
  }>;
  onDayClick?: (date: Date) => void;
}

export function PericiasCalendar({ pericias, onDayClick }: PericiasCalendarProps) {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const today = new Date();

  const daysOfWeek = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    
    // Add padding days for the start of the month
    const startDayOfWeek = getDay(start);
    const paddingDays = Array(startDayOfWeek).fill(null);
    
    return [...paddingDays, ...days];
  }, [currentMonth]);

  const periciasDates = useMemo(() => {
    return pericias
      .filter(p => p.dataPericia)
      .map(p => new Date(p.dataPericia!));
  }, [pericias]);

  const hasPericia = (date: Date) => {
    return periciasDates.some(d => isSameDay(d, date));
  };

  const getPericiaCount = (date: Date) => {
    return periciasDates.filter(d => isSameDay(d, date)).length;
  };

  const getPericiasForDate = (date: Date) => {
    return pericias.filter(p => p.dataPericia && isSameDay(new Date(p.dataPericia), date));
  };

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    onDayClick?.(day);
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Calendário</CardTitle>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[100px] text-center capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
            </span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {daysOfWeek.map((day) => (
            <div 
              key={day} 
              className="text-center text-xs font-medium text-muted-foreground py-1"
            >
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, index) => {
            if (!day) {
              return <div key={`empty-${index}`} className="h-9" />;
            }
            
            const isToday = isSameDay(day, today);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const hasPericiaDay = hasPericia(day);
            const periciaCount = getPericiaCount(day);
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const periciasNoDia = getPericiasForDate(day);
            
            const dayButton = (
              <button
                onClick={() => handleDayClick(day)}
                className={cn(
                  "h-9 w-full rounded-md text-sm font-medium relative transition-colors",
                  "hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                  isCurrentMonth ? "text-foreground" : "text-muted-foreground/50",
                  isToday && "bg-primary text-primary-foreground hover:bg-primary/90",
                  hasPericiaDay && !isToday && "bg-primary/10",
                  isSelected && !isToday && "ring-2 ring-primary ring-offset-2"
                )}
              >
                {format(day, "d")}
                {hasPericiaDay && (
                  <span className={cn(
                    "absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5",
                  )}>
                    {Array.from({ length: Math.min(periciaCount, 3) }).map((_, i) => (
                      <span 
                        key={i}
                        className={cn(
                          "h-1 w-1 rounded-full",
                          isToday ? "bg-primary-foreground" : "bg-primary"
                        )}
                      />
                    ))}
                  </span>
                )}
              </button>
            );

            // Only wrap with Popover if there are pericias on this day
            if (hasPericiaDay) {
              return (
                <Popover key={day.toISOString()}>
                  <PopoverTrigger asChild>
                    {dayButton}
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3" align="center">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm text-foreground">
                        Perícias em {format(day, "dd/MM/yyyy")}
                      </h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {periciasNoDia.map(p => (
                          <div 
                            key={p.id} 
                            className="flex items-center justify-between p-2 rounded-lg bg-muted/50 gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm truncate text-foreground">
                                {p.vitimaName || "Sem nome"}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {p.processoNumero || "Processo N/I"}
                              </p>
                            </div>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="shrink-0 h-8 px-2"
                              onClick={() => navigate(`/laudo/${p.id}`)}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              );
            }

            return <div key={day.toISOString()}>{dayButton}</div>;
          })}
        </div>
      </CardContent>
    </Card>
  );
}