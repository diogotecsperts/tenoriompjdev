import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface Laudo {
  id: string;
  dataPericia: string | null;
  vitimaName?: string;
  title: string;
}

interface ProximosCompromissosCardsProps {
  appointments: Laudo[];
  onViewAll: () => void;
}

export function ProximosCompromissosCards({ appointments, onViewAll }: ProximosCompromissosCardsProps) {
  const navigate = useNavigate();

  const handleClick = (id: string) => {
    navigate(`/laudo/${id}`);
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Próximos Compromissos</CardTitle>
          <Button variant="ghost" size="sm" className="text-primary" onClick={onViewAll}>
            Ver Agenda
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {appointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4">
            <Calendar className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground text-sm text-center">
              Nenhum compromisso agendado
            </p>
            <p className="text-muted-foreground/70 text-xs text-center mt-1">
              Agende uma perícia definindo a data no formulário
            </p>
          </div>
        ) : (
          appointments.slice(0, 3).map((laudo) => (
            <div
              key={laudo.id}
              onClick={() => handleClick(laudo.id)}
              className="flex gap-4 p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
            >
              {/* Date Badge */}
              <div className="flex flex-col items-center justify-center min-w-[50px] h-[50px] rounded-lg bg-primary text-primary-foreground">
                <span className="text-[10px] font-semibold uppercase leading-tight">
                  {format(new Date(laudo.dataPericia!), "MMM", { locale: ptBR })}
                </span>
                <span className="text-xl font-bold leading-tight">
                  {format(new Date(laudo.dataPericia!), "dd")}
                </span>
              </div>

              {/* Info */}
              <div className="flex flex-col justify-center flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground truncate">
                  {laudo.vitimaName || laudo.title}
                </span>
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span className="text-xs">09:00</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span className="text-xs truncate">Consultório</span>
                  </div>
                </div>
              </div>

              {/* Type Badge */}
              <div className="flex items-center">
                <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium whitespace-nowrap">
                  Acidente Trabalho
                </span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
