 import { useMemo, useState } from "react";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Badge } from "@/components/ui/badge";
 import { Checkbox } from "@/components/ui/checkbox";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
 import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Minus } from "lucide-react";
 import { cn } from "@/lib/utils";
 import { LAUDO_CARDS_STRUCTURE, EXPECTED_PROMPT_TYPES, PromptType } from "@/lib/laudo-structure";
 
 interface PromptConfig {
   id: string;
   cardId?: string;
   sectionId?: string;
   description?: string;
 }
 
 interface CoverageChecklistProps {
   prompts: PromptConfig[];
 }
 
 function getPromptType(promptId: string): PromptType | null {
   if (promptId.startsWith('prompt_import_')) return 'import';
   if (promptId.startsWith('prompt_gen_')) return 'gen';
   if (promptId.startsWith('prompt_regen_')) return 'regen';
   return null;
 }
 
 export function CoverageChecklist({ prompts }: CoverageChecklistProps) {
   const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
 
   // Build coverage data
   const coverageData = useMemo(() => {
     // Build a map of existing prompts by section and type
     const promptsBySectionAndType: Record<string, Record<PromptType, PromptConfig[]>> = {};
     
     prompts.forEach(p => {
       if (p.sectionId) {
         const type = getPromptType(p.id);
         if (type) {
           if (!promptsBySectionAndType[p.sectionId]) {
             promptsBySectionAndType[p.sectionId] = { import: [], gen: [], regen: [] };
           }
           promptsBySectionAndType[p.sectionId][type].push(p);
         }
       }
     });
 
     // Build coverage for each card
     return LAUDO_CARDS_STRUCTURE.map(card => {
       const sections = card.sections.map(section => {
         const expectedTypes = EXPECTED_PROMPT_TYPES[section.id] || [];
         const existingByType = promptsBySectionAndType[section.id] || { import: [], gen: [], regen: [] };
         
         const typeStatus: Record<PromptType, { expected: boolean; count: number; prompts: PromptConfig[] }> = {
           import: {
             expected: expectedTypes.includes('import'),
             count: existingByType.import.length,
             prompts: existingByType.import,
           },
           gen: {
             expected: expectedTypes.includes('gen'),
             count: existingByType.gen.length,
             prompts: existingByType.gen,
           },
           regen: {
             expected: expectedTypes.includes('regen'),
             count: existingByType.regen.length,
             prompts: existingByType.regen,
           },
         };
 
         const isComplete = expectedTypes.every(t => typeStatus[t].count > 0);
         const hasNoExpectations = expectedTypes.length === 0;
 
         return {
           ...section,
           typeStatus,
           isComplete,
           hasNoExpectations,
         };
       });
 
       const completeSections = sections.filter(s => s.isComplete || s.hasNoExpectations).length;
       const isCardComplete = completeSections === sections.length;
 
       return {
         ...card,
         sections,
         completeSections,
         totalSections: sections.length,
         isCardComplete,
       };
     });
   }, [prompts]);
 
   const toggleCard = (cardId: string) => {
     setExpandedCards(prev => {
       const next = new Set(prev);
       if (next.has(cardId)) {
         next.delete(cardId);
       } else {
         next.add(cardId);
       }
       return next;
     });
   };
 
   const typeLabels: Record<PromptType, { label: string; color: string }> = {
     import: { label: 'Importar', color: 'text-purple-600' },
     gen: { label: 'Gerar', color: 'text-emerald-600' },
     regen: { label: 'Regerar', color: 'text-blue-600' },
   };
 
   // Calculate overall stats
   const overallStats = useMemo(() => {
     let totalExpected = 0;
     let totalCovered = 0;
     
     coverageData.forEach(card => {
       card.sections.forEach(section => {
         (['import', 'gen', 'regen'] as PromptType[]).forEach(type => {
           if (section.typeStatus[type].expected) {
             totalExpected++;
             if (section.typeStatus[type].count > 0) {
               totalCovered++;
             }
           }
         });
       });
     });
 
     const percentage = totalExpected > 0 ? Math.round((totalCovered / totalExpected) * 100) : 100;
     return { totalExpected, totalCovered, percentage };
   }, [coverageData]);
 
   return (
     <Card>
       <CardHeader className="py-3 px-4">
         <CardTitle className="text-sm font-medium flex items-center justify-between">
           <span className="flex items-center gap-2">
             <CheckCircle2 className="h-4 w-4 text-primary" />
             Cobertura de Prompts
           </span>
           <Badge 
             variant={overallStats.percentage === 100 ? "default" : "secondary"}
             className="text-xs"
           >
             {overallStats.percentage}%
           </Badge>
         </CardTitle>
       </CardHeader>
       <CardContent className="p-0">
         <ScrollArea className="h-[calc(100vh-600px)] min-h-[200px]">
           <div className="p-2 space-y-1">
             {coverageData.map(card => {
               const isExpanded = expandedCards.has(card.id);
               
               return (
                 <Collapsible 
                   key={card.id} 
                   open={isExpanded} 
                   onOpenChange={() => toggleCard(card.id)}
                 >
                   <CollapsibleTrigger className="w-full">
                     <div className={cn(
                       "flex items-center justify-between px-2 py-1.5 rounded-md text-sm hover:bg-muted/50 transition-colors",
                       card.isCardComplete && "text-muted-foreground"
                     )}>
                       <div className="flex items-center gap-2">
                         {isExpanded ? (
                           <ChevronDown className="h-3 w-3 text-muted-foreground" />
                         ) : (
                           <ChevronRight className="h-3 w-3 text-muted-foreground" />
                         )}
                         {card.isCardComplete ? (
                           <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                         ) : (
                           <XCircle className="h-4 w-4 text-amber-500" />
                         )}
                         <span className="font-medium truncate max-w-[140px]">{card.label}</span>
                       </div>
                       <span className="text-xs text-muted-foreground">
                         {card.completeSections}/{card.totalSections}
                       </span>
                     </div>
                   </CollapsibleTrigger>
                   <CollapsibleContent>
                     <div className="ml-6 mt-1 space-y-2 pb-2">
                       {card.sections.map(section => (
                         <div key={section.id} className="text-xs space-y-1">
                           <div className={cn(
                             "font-medium",
                             section.isComplete || section.hasNoExpectations 
                               ? "text-muted-foreground" 
                               : "text-foreground"
                           )}>
                             {section.label}
                             {section.hasNoExpectations && (
                               <span className="ml-1 text-muted-foreground">(manual)</span>
                             )}
                           </div>
                           {!section.hasNoExpectations && (
                             <div className="flex gap-3 ml-2">
                               {(['import', 'gen', 'regen'] as PromptType[]).map(type => {
                                 const status = section.typeStatus[type];
                                 if (!status.expected) {
                                   return (
                                     <div key={type} className="flex items-center gap-1 text-muted-foreground/50">
                                       <Minus className="h-3 w-3" />
                                       <span>{typeLabels[type].label}</span>
                                     </div>
                                   );
                                 }
                                 return (
                                   <div 
                                     key={type} 
                                     className={cn(
                                       "flex items-center gap-1",
                                       status.count > 0 ? "text-emerald-600" : "text-destructive"
                                     )}
                                   >
                                     {status.count > 0 ? (
                                       <CheckCircle2 className="h-3 w-3" />
                                     ) : (
                                       <XCircle className="h-3 w-3" />
                                     )}
                                     <span>{typeLabels[type].label}</span>
                                     {status.count > 0 && (
                                       <span className="text-muted-foreground">({status.count})</span>
                                     )}
                                   </div>
                                 );
                               })}
                             </div>
                           )}
                         </div>
                       ))}
                     </div>
                   </CollapsibleContent>
                 </Collapsible>
               );
             })}
           </div>
         </ScrollArea>
       </CardContent>
     </Card>
   );
 }