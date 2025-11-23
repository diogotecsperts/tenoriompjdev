import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SectionNavigationProps {
  currentIndex: number;
  totalSections: number;
  onPrevious: () => void;
  onNext: () => void;
}

export function SectionNavigation({
  currentIndex,
  totalSections,
  onPrevious,
  onNext,
}: SectionNavigationProps) {
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalSections - 1;

  return (
    <div className="flex items-center justify-between border-t pt-6 mt-6">
      <Button
        variant="outline"
        onClick={onPrevious}
        disabled={isFirst}
        className="gap-2"
      >
        <ChevronLeft className="h-4 w-4" />
        Anterior
      </Button>
      
      <span className="text-sm text-muted-foreground">
        Seção {currentIndex + 1} de {totalSections}
      </span>

      <Button
        onClick={onNext}
        disabled={isLast}
        className="gap-2"
      >
        Próxima
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
