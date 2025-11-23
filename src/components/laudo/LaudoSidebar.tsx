import { FileText } from "lucide-react";
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

interface LaudoSidebarProps {
  sections: Array<{ id: string; label: string }>;
  activeSection: string;
  onSectionChange: (sectionId: string) => void;
}

export function LaudoSidebar({ sections, activeSection, onSectionChange }: LaudoSidebarProps) {
  const { open } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center space-x-2">
            <FileText className="h-4 w-4" />
            {open && <span>Seções do Laudo</span>}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sections.map((section) => (
                <SidebarMenuItem key={section.id}>
                  <SidebarMenuButton
                    onClick={() => onSectionChange(section.id)}
                    isActive={activeSection === section.id}
                    className="w-full justify-start"
                  >
                    <span>{section.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
