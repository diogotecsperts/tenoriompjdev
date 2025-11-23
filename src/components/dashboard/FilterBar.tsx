import { useState } from "react";
import { Search, Filter, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

export interface FilterState {
  searchText: string;
  vitimaName: string;
  dataAcidenteStart: string;
  dataAcidenteEnd: string;
  dataPericiaStart: string;
  dataPericiaEnd: string;
  processoNumero: string;
  reclamante: string;
}

interface FilterBarProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  resultCount: number;
}

export function FilterBar({ filters, onFiltersChange, resultCount }: FilterBarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const updateFilter = (key: keyof FilterState, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({
      searchText: "",
      vitimaName: "",
      dataAcidenteStart: "",
      dataAcidenteEnd: "",
      dataPericiaStart: "",
      dataPericiaEnd: "",
      processoNumero: "",
      reclamante: "",
    });
  };

  const activeFiltersCount = Object.entries(filters).filter(
    ([key, value]) => key !== "searchText" && value !== ""
  ).length;

  const hasActiveFilters = filters.searchText !== "" || activeFiltersCount > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por título, vítima ou processo..."
            value={filters.searchText}
            onChange={(e) => updateFilter("searchText", e.target.value)}
            className="pl-9"
          />
        </div>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filtros
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-4 w-4" />
            Limpar
          </Button>
        )}
      </div>

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleContent className="space-y-4 rounded-lg border bg-card p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vitima">Nome da Vítima</Label>
              <Input
                id="vitima"
                placeholder="Filtrar por vítima"
                value={filters.vitimaName}
                onChange={(e) => updateFilter("vitimaName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="processo">Número do Processo</Label>
              <Input
                id="processo"
                placeholder="Filtrar por processo"
                value={filters.processoNumero}
                onChange={(e) => updateFilter("processoNumero", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reclamante">Reclamante</Label>
              <Input
                id="reclamante"
                placeholder="Filtrar por reclamante"
                value={filters.reclamante}
                onChange={(e) => updateFilter("reclamante", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Data do Acidente</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={filters.dataAcidenteStart}
                  onChange={(e) => updateFilter("dataAcidenteStart", e.target.value)}
                  placeholder="De"
                />
                <span className="text-muted-foreground">até</span>
                <Input
                  type="date"
                  value={filters.dataAcidenteEnd}
                  onChange={(e) => updateFilter("dataAcidenteEnd", e.target.value)}
                  placeholder="Até"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Data da Perícia</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={filters.dataPericiaStart}
                  onChange={(e) => updateFilter("dataPericiaStart", e.target.value)}
                  placeholder="De"
                />
                <span className="text-muted-foreground">até</span>
                <Input
                  type="date"
                  value={filters.dataPericiaEnd}
                  onChange={(e) => updateFilter("dataPericiaEnd", e.target.value)}
                  placeholder="Até"
                />
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {hasActiveFilters && (
        <div className="text-sm text-muted-foreground">
          {resultCount} {resultCount === 1 ? "laudo encontrado" : "laudos encontrados"}
        </div>
      )}
    </div>
  );
}
