import { FileText, CheckCircle2, Circle, ChevronRight } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CardProgress } from "@/hooks/useLaudoProgress";

interface LaudoSidebarProps {
  sections: Array<{ 
    id: string; 
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
  }>;
  activeSection: string;
  onSectionChange: (sectionId: string) => void;
  cardProgress?: CardProgress[];
  overallPercentage?: number;
}

export function LaudoSidebar({ 
  sections, 
  activeSection, 
  onSectionChange,
  cardProgress = [],
  overallPercentage = 0,
}: LaudoSidebarProps) {
  const { open } = useSidebar();

  // Mapear progresso por cardId
  const progressMap = cardProgress.reduce((acc, cp) => {
    acc[cp.cardId] = cp;
    return acc;
  }, {} as Record<string, CardProgress>);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Progresso Geral */}
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center space-x-2">
            <FileText className="h-4 w-4" />
            {open && <span>Seções do Laudo</span>}
          </SidebarGroupLabel>
          
          {open && (
            <div className="px-3 py-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Progresso</span>
                <span className="font-medium">{overallPercentage}%</span>
              </div>
              <Progress value={overallPercentage} className="h-2" />
            </div>
          )}
          
          <SidebarGroupContent>
            <SidebarMenu>
              {sections.map((section) => {
                const progress = progressMap[section.id];
                const isComplete = progress?.percentage === 100;
                const hasProgress = progress && progress.filledFields > 0;
                const Icon = section.icon;
                
                return (
                  <SidebarMenuItem key={section.id}>
                    <SidebarMenuButton
                      onClick={() => onSectionChange(section.id)}
                      isActive={activeSection === section.id}
                      className={cn(
                        "w-full justify-start group",
                        isComplete && "text-green-600 dark:text-green-400"
                      )}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {/* Ícone de status ou ícone da seção */}
                        {isComplete ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                        ) : hasProgress ? (
                          <div className="relative h-4 w-4 shrink-0">
                            <Circle className="h-4 w-4 text-muted-foreground/30" />
                            <svg className="absolute inset-0 h-4 w-4 -rotate-90" viewBox="0 0 16 16">
                              <circle
                                cx="8"
                                cy="8"
                                r="6"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeDasharray={`${(progress.percentage / 100) * 37.7} 37.7`}
                                className="text-primary"
                              />
                            </svg>
                          </div>
                        ) : Icon ? (
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <Circle className="h-4 w-4 shrink-0 text-muted-foreground/30" />
                        )}
                        
                        {/* Nome da seção */}
                        {open && (
                          <span className="truncate">{section.label}</span>
                        )}
                      </div>
                      
                      {/* Indicador de progresso no hover */}
                      {open && progress && !isComplete && (
                        <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                          {progress.filledFields}/{progress.totalFields}
                        </span>
                      )}
                      
                      {/* Seta de navegação */}
                      {activeSection === section.id && (
                        <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
