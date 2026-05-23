import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

interface Props {
  label: string;
}

export function PlaceholderSection({ label }: Props) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-10 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 mb-3">
          <Construction className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">{label}</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Esta seção será implementada nas próximas fases do módulo Previdenciário.
        </p>
      </CardContent>
    </Card>
  );
}
