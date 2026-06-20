 import { useMemo, useState } from "react";
 import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
 import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
 import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
 import { AlertTriangle, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import { LAUDO_CARDS_STRUCTURE, EXPECTED_PROMPT_TYPES, PromptType } from "@/lib/laudo-structure";

interface CardLike {
  id: string;
  label: string;
  sections: { id: string; label: string }[];
}

interface PromptConfig {
  id: string;
  cardId?: string;
  sectionId?: string;
}

interface UncoveredSection {
  cardId: string;
  cardLabel: string;
  sectionId: string;
  sectionLabel: string;
  missingTypes: PromptType[];
}

interface CoverageAlertProps {
  prompts: PromptConfig[];
  onNavigateToSection?: (sectionId: string) => void;
  /** Estrutura de cards para verificação. Default = Trabalhista (compat). */
  structure?: CardLike[];
  /** Mapa de tipos esperados. Default = Trabalhista (compat). */
  expectedTypes?: Record<string, PromptType[]>;
}

function getPromptType(promptId: string): PromptType | null {
  if (promptId.startsWith('prompt_import_')) return 'import';
  if (promptId.startsWith('prompt_gen_')) return 'gen';
  if (promptId.startsWith('prompt_regen_')) return 'regen';
  // prev prompts (prompt_prev_*) são considerados "import" — extraem do PDF.
  if (promptId.startsWith('prompt_prev_')) return 'import';
  return null;
}

export function CoverageAlert({
  prompts,
  onNavigateToSection,
  structure = LAUDO_CARDS_STRUCTURE,
  expectedTypes = EXPECTED_PROMPT_TYPES,
}: CoverageAlertProps) {
   const [isExpanded, setIsExpanded] = useState(false);
 
   const uncoveredSections = useMemo(() => {
     const results: UncoveredSection[] = [];
 
     // Build a map of existing prompts by section and type
     const promptsBySectionAndType: Record<string, Set<PromptType>> = {};
     
     prompts.forEach(p => {
       if (p.sectionId) {
         const type = getPromptType(p.id);
         if (type) {
           if (!promptsBySectionAndType[p.sectionId]) {
             promptsBySectionAndType[p.sectionId] = new Set();
           }
           promptsBySectionAndType[p.sectionId].add(type);
         }
       }
     });
 
      // Check each section against expected types
    for (const card of structure) {
      for (const section of card.sections) {
        const expected = expectedTypes[section.id] || [];

        // Skip sections that don't expect any prompts
        if (expected.length === 0) continue;

        const existingTypes = promptsBySectionAndType[section.id] || new Set();
        const missingTypes = expected.filter(t => !existingTypes.has(t));

        if (missingTypes.length > 0) {
          results.push({
            cardId: card.id,
            cardLabel: card.label,
            sectionId: section.id,
            sectionLabel: section.label,
            missingTypes,
          });
        }
      }
    }

    return results;
  }, [prompts, structure, expectedTypes]);
 
   if (uncoveredSections.length === 0) return null;
 
   const typeLabels: Record<PromptType, string> = {
     import: 'Importar',
     gen: 'Gerar',
     regen: 'Regerar',
   };
 
   return (
     <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
       <Alert className="border-amber-500/50 bg-amber-500/10">
         <AlertTriangle className="h-4 w-4 text-amber-600" />
         <AlertTitle className="flex items-center justify-between">
           <span>Cobertura Incompleta de Prompts</span>
           <CollapsibleTrigger asChild>
             <Button variant="ghost" size="sm" className="h-6 px-2">
               {isExpanded ? (
                 <ChevronDown className="h-4 w-4" />
               ) : (
                 <ChevronRight className="h-4 w-4" />
               )}
             </Button>
           </CollapsibleTrigger>
         </AlertTitle>
         <AlertDescription>
           <span className="text-amber-700 dark:text-amber-400">
             {uncoveredSections.length} seção(ões) do laudo não possuem todos os prompts esperados.
           </span>
           
           <CollapsibleContent className="mt-3">
             <div className="space-y-2 max-h-60 overflow-y-auto">
               {uncoveredSections.map(section => (
                 <div 
                   key={`${section.cardId}-${section.sectionId}`}
                   className="flex items-center justify-between bg-background/50 rounded-md p-2 text-sm"
                 >
                   <div className="flex items-center gap-2">
                     <span className="text-muted-foreground">{section.cardLabel}</span>
                     <ArrowRight className="h-3 w-3 text-muted-foreground" />
                     <span className="font-medium">{section.sectionLabel}</span>
                   </div>
                   <div className="flex gap-1">
                     {section.missingTypes.map(type => (
                       <Badge 
                         key={type} 
                         variant="outline" 
                         className="text-xs border-amber-500/50 text-amber-700 dark:text-amber-400"
                       >
                         {typeLabels[type]}
                       </Badge>
                     ))}
                   </div>
                 </div>
               ))}
             </div>
             
             <p className="text-xs text-muted-foreground mt-3">
               💡 Use "Verificar Atualizações" para sincronizar prompts faltantes do código-fonte.
             </p>
           </CollapsibleContent>
         </AlertDescription>
       </Alert>
     </Collapsible>
   );
 }