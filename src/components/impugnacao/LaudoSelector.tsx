import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FileText, Search, ChevronDown, Calendar, User, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Laudo {
  id: string;
  title: string;
  vitima_nome: string | null;
  processo_numero: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  conclusao_analise: string | null;
}

interface LaudoSelectorProps {
  selectedLaudo: Laudo | null;
  onSelect: (laudo: Laudo | null) => void;
}

export function LaudoSelector({ selectedLaudo, onSelect }: LaudoSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [laudos, setLaudos] = useState<Laudo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLaudos();
  }, []);

  const fetchLaudos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("laudos")
        .select("id, title, vitima_nome, processo_numero, status, created_at, updated_at, conclusao_analise")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setLaudos(data || []);
    } catch (error) {
      console.error("Erro ao buscar laudos:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLaudos = laudos.filter((laudo) => {
    const searchLower = search.toLowerCase();
    return (
      laudo.title?.toLowerCase().includes(searchLower) ||
      laudo.vitima_nome?.toLowerCase().includes(searchLower) ||
      laudo.processo_numero?.toLowerCase().includes(searchLower)
    );
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return format(new Date(dateString), "dd/MM/yyyy", { locale: ptBR });
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "finalizado":
        return <Badge variant="default" className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20">Finalizado</Badge>;
      case "em_andamento":
        return <Badge variant="secondary">Em andamento</Badge>;
      case "rascunho":
        return <Badge variant="outline">Rascunho</Badge>;
      default:
        return <Badge variant="outline">{status || "—"}</Badge>;
    }
  };

  const handleSelect = (laudo: Laudo) => {
    onSelect(laudo);
    setOpen(false);
    setSearch("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
  };

  return (
    <div className="space-y-2">
      <Label>Laudo Vinculado</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-auto min-h-[60px] p-3"
          >
            {selectedLaudo ? (
              <div className="flex items-start gap-3 w-full text-left">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">
                      {selectedLaudo.vitima_nome || selectedLaudo.title}
                    </span>
                    {getStatusBadge(selectedLaudo.status)}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {selectedLaudo.processo_numero || "Sem número de processo"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={handleClear}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>Selecionar laudo impugnado...</span>
              </div>
            )}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[450px] p-0" align="start">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, processo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <ScrollArea className="h-[300px]">
            {loading ? (
              <div className="p-3 space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredLaudos.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                {search ? "Nenhum laudo encontrado" : "Nenhum laudo disponível"}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredLaudos.map((laudo) => (
                  <Card
                    key={laudo.id}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                      selectedLaudo?.id === laudo.id ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => handleSelect(laudo)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-medium truncate text-sm">
                              {laudo.vitima_nome || laudo.title}
                            </span>
                            {getStatusBadge(laudo.status)}
                          </div>
                          <p className="text-xs text-muted-foreground truncate mb-1">
                            {laudo.processo_numero || "Sem número de processo"}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(laudo.updated_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
